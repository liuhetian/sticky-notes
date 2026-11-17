# 牛牛便利贴

https://clip.liuhetian.life ：这台设备粘贴，那台设备拿走。功能和规则见 [REQUIREMENTS.md](REQUIREMENTS.md)。wiki（给 AI 的接口说明）在 https://clip.liuhetian.life/wiki/ （源文件 `docs/`），按 [test-wiki 的子服务规范](../test-wiki/main-wiki/docs/new-subservice.md) 接入主 wiki。

- 页面和接口：EdgeOne Makers 项目 `clip`（中国大陆加速）
- 元素数据：EdgeOne Blob（存储名 `clipboard`）
- 文件（图片、附件、压缩包、地图缩略图）：COS 桶 `clip-1307341066`（成都，私有）

## 命令

密钥都写在 `.env`（不进 git），脚本自己读，不用手动导出环境变量。

```bash
npm test          # vitest：内存版存储上跑全部接口和共用逻辑
npm run dev       # 本地页面，/api 代理到线上
npm run deploy    # 类型检查 → 测试 → 构建（页面、文档站、边缘函数）→ 部署（平台上不构建，传的是 build/）
npm run smoke     # 线上冒烟，跑完把测试数据彻底删掉
npm run backup    # 导出所有白板和元素到 backups/（不含文件本体）
npm run wipe -- --yes  # 清库：删掉所有元素和文件，白板列表保留；数据格式变了时用，先 backup
npm run setup     # 环境准备，可重复跑：建项目和环境变量、配桶的跨域规则、绑域名
```

从零开始的顺序是 `setup → deploy → setup`：平台要求项目先部署过一次才能绑域名。

`.env` 里要有：

| 变量 | 用途 |
|---|---|
| `COS_SECRET_ID` / `COS_SECRET_KEY` | 主账号密钥，只在本机脚本里用：建项目、绑域名、配桶的跨域规则 |
| `CLIP_COS_BUCKET` / `CLIP_COS_REGION` | 存文件的桶 |
| `CLIP_COS_SECRET_ID` / `CLIP_COS_SECRET_KEY` | 只管这个桶的子账号 `clip`，线上边缘函数用的就是它 |
| `SITE_PASSWORD`（可选） | 共用密码，哪里都能用；不写就沿用项目里已有的 |
| `AI_PASSWORD`（可选） | AI 的密码，只能调 `/api/ai/` 下的接口 |
| `NAMES` | 名字映射，比如 `banana:香蕉,niuniu:牛牛,ai:AI,dami:大米`；请求带的名字必须在这里 |
| `WEB_NAMES`（可选） | 登录页可选的名字，比如 `banana,niuniu`；不写就是全部 |
| `WIKI_ROOT`（可选） | test-wiki 的位置，默认兄弟目录 `../test-wiki` |

密码和名字映射由 `npm run setup` 写进项目的环境变量，`smoke`、`backup`、`wipe` 会自己去取（以 `NAMES` 里第一个名字的身份调）。脚本和快捷指令的请求头是 `X-Password: 密码#名字`。

wiki 用 [Zensical](https://zensical.org) 构建（`./deploy.sh`，`npm run build` 会调它），`live.js`、`postbuild.py`、Python 环境和占位符的共享用例都用 test-wiki 的：构建机上要有 test-wiki，并在里面 `uv sync` 过。

## 目录

```
src/
  shared/          不依赖 DOM 的纯逻辑，前后端都能用、单测直接测：数据模型（zod）、常量、
                   元素的基础字段和合并规则（items.ts）、画布和卡片尺寸（layout.ts）、待办、坐标、便利贴里的引用
  server/
    edge.ts        边缘函数入口：接上 EdgeOne Blob 和 COS
    app.ts         把各组路由拼起来
    wiki.ts        /wiki/<页>.md：docs/ 原文打进函数，占位符换成实时数据（md-render.ts 抄自 test-wiki）
    auth.ts        身份：cookie 或 X-Password: 密码#名字，AI 的密码只放行 /api/ai/
    routes/        接口，按资源分：白板、元素、文件、快捷指令分享、给 AI 的（ai.ts）、登录等；只管取参数和回状态码
    services/      业务规则：新建和修改元素、废纸篓和到期、文件接收（聊天记录压缩包）、自动排位、每天的清理
    repo/db.ts     元素数据的读写（对象布局写在文件开头）
    storage/       两种存储的接口和实现：Blob、COS（含签名）
  web/
    api/           带类型的接口客户端
    state/         数据同步、写操作入口、撤销栈、本机设置
    features/      按功能分：board（画布）、items（卡片）、links（连线）、location、sketch、sidebar、dialogs……
                   每种卡片能做的事（右键菜单和卡片工具条共用）在 items/itemActions.ts，加新类型从这里开始
    lib/ ui/ styles/
docs/              wiki 源文件：deploy.sh 构建成 site/，上线时放在 /wiki/（不含 .md）；/wiki/<页>.md 由边缘函数渲染
scripts/           构建、部署、环境准备、冒烟、备份、清库
tests/             接口和共用逻辑的测试（helpers.ts 里是内存版的两种存储）
```

## 几个决定

- **一个元素一个对象**。改元素只覆盖这次带来的字段（合并规则在 `shared/items.ts`，服务端存和前端先改界面用同一份）；改文字带 `baseRev`，对不上回 409，前端让人选覆盖、另存或放弃。
- **同步**：先拿 `etags`（id + etag），只取变了的元素，一次取完。默认不定时拉（设置里的「自动同步」关着），只在打开页面、切回页面时拉；有「上传中」的卡片时每 5 秒看一次。提醒由页面自己计时，不靠轮询。
- **便利贴的引用写在文字里**：`[标题](/id)`（引用图片上的点带 `#px,py`），只在同一块白板里找（`shared/refs.ts`）。便利贴连出去的线从文字推导、从那个链接的位置画出去，删线就是删这段文字；只有图片、文件、位置连出去的线才存进 `links`。
- **分享链接带着白板**：`/share/<白板>/<元素>`，只认那块白板，不全站找。靠 `edgeone.json` 的 SPA fallback 回到首页，前端读完就把路径去掉。
- **身份**：每个元素记最近编辑者 `by` 和时间 `editedAt`（新建、改文字和地名才算）。网页登录时选名字，签进 cookie；脚本、快捷指令、AI 每次带 `密码#名字`。名字映射在部署配置里，前端从不用登录的 `/api/names` 取。
- **写操作只有一个入口**（`web/state/actions.ts`）：先改界面再排队发请求，失败回滚；新建元素的 id 由前端定，所以不用等服务端就能显示。撤销记的是每一步「怎么改回去」。
- **删除和到期都是挪进废纸篓**，在那里再留 30 天才真删；文件跟着元素走，真删时才删。
- **文件不经过边缘函数**：上传是浏览器拿预签名地址直接 PUT 到 COS，显示和下载是跳转到 COS 的临时地址（同一天内地址不变，浏览器能缓存）。只有要读像素的地方（在图片上画、复制图片、转 HEIC）走 `?raw=1` 由本站转发，避开跨域。
- **COS 签名是自己写的**（`server/storage/cos-sign.ts`）：边缘运行时的 `URLSearchParams` 不能遍历，现成的 aws4fetch 在上面跑不起来。
- **边缘函数只认 JS**：`scripts/build-edge.ts` 用 esbuild 打包，并把末尾的 `export{X as onRequest}` 改写成函数声明，否则平台认不出入口。
- **位置卡片的地图由浏览器直接取**：边缘节点连不上 OpenStreetMap。缩略图是把瓦片拼到画布上导出的一张图片，和地名一起只在卡片刚建好时取一次，存下来之后不再依赖地图服务。地名用 Photon（OpenStreetMap 数据，允许网页直接调）。
- **每块白板最多 50 个元素，一次请求读完**：边缘函数一次执行约 62 个请求就到头（线上实测 62~64），超了存储报错。新建的 store 还没凭据时并发读，每个读都会各自换一次凭据（一个元素算两个请求），所以 `Db.getItems` 先单独读一个再并发，实测一次读 58 个都稳。读整块白板 = 换凭据 1 + 列名字 1 + 读 50，剩下几次给顺手的事（到期挪走、「上传中」转正，每次最多 2 个）。排序、筛选都是读出来以后做，不另建索引；唯一的索引是提醒。读 50 个偶尔整个请求失败（545），靠下一次同步重试。
- **别的要读很多元素的地方都分批**：清空废纸篓、删白板每次 6 个，废纸篓超出 50 个时每次修剪 2 个，前端接着调到做完；每天的清理（`services/cleanup.ts`）把进度记在存储里，定时任务每天推一批，页面打开时接着调到做完；边缘函数请求自己的域名会被平台回 404，没法自己接力。快捷指令发来的聊天记录压缩包是在读白板时拆的，拆包要写很多次，白板满的时候可能超出额度，这一点没处理。
- **后端留在边缘函数，不用云函数**：实测云函数没有上面的限制，但每个请求慢一倍、冷启动 2–3 秒、往外回数据只有约 170 KB/s。
- **文档预览交给 COS 数据万象**：封面是 `ci-process=doc-preview` 现转的第一页图片，翻看是它自带的在线阅读器，前端没有渲染代码。聊天记录压缩包超过 10 MB 不拆（边缘函数内存装不下）。
- **提醒只在页面开着时响**：定时任务最小间隔一天；每天 04:00 的定时任务只做清理。
- **iPhone 分享**：iOS 不支持 Web Share Target，改用快捷指令；它自己分清类型，分别调 `/api/share/text`、`/api/share/link`、`/api/share/location`、`/api/share/file`，服务端不猜内容；搭法在页面侧栏的 i 按钮里。
- **给 AI 的接口在 `/api/ai/*`**（`routes/ai.ts`）：和网页调同一套 services，只是换个入口、白板能写名字、便利贴默认白色、改文字用「原文换新文」。能调的都列在那个文件里，彻底删除、清空废纸篓、白板管理都不开放。说明文档按 test-wiki 的规范放在 `/wiki/`：页面 `/wiki/x/` 是静态站，同一路径的 `/wiki/x.md` 由边缘函数渲染（`server/wiki.ts`）。EdgeOne 上静态文件优先于函数、函数又读不到静态文件，所以 `.md` 不上传、原文打进函数；同一个函数包放在 `/api/` 和 `/wiki/` 两个入口。占位符规则用共享的 `live.js` 和 `md-render.ts`，没登录时显示「加载失败」；接口对所有来源开放跨域，但主 wiki 跨域不带凭据，收纳过去的页面看不到实时数据。
