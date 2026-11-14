# 牛牛便利贴

https://clip.liuhetian.life ：这台设备粘贴，那台设备拿走。功能和规则见 [REQUIREMENTS.md](REQUIREMENTS.md)。

- 页面和接口：EdgeOne Makers 项目 `clip`（中国大陆加速）
- 元素数据：EdgeOne Blob（存储名 `clipboard`）
- 文件（图片、附件、压缩包、地图缩略图）：COS 桶 `clip-1307341066`（成都，私有）

## 命令

密钥都写在 `.env`（不进 git），脚本自己读，不用手动导出环境变量。

```bash
npm test          # vitest：内存版存储上跑全部接口和共用逻辑
npm run dev       # 本地页面，/api 代理到线上
npm run deploy    # 类型检查 → 测试 → 构建 → 部署（平台上不构建，传的是 build/）
npm run smoke     # 线上冒烟，跑完把测试数据彻底删掉
npm run backup    # 导出所有白板和元素到 backups/（不含文件本体）
npm run setup     # 环境准备，可重复跑：建项目和环境变量、配桶的跨域规则、绑域名
```

从零开始的顺序是 `setup → deploy → setup`：平台要求项目先部署过一次才能绑域名。

`.env` 里要有：

| 变量 | 用途 |
|---|---|
| `COS_SECRET_ID` / `COS_SECRET_KEY` | 主账号密钥，只在本机脚本里用：建项目、绑域名、配桶的跨域规则 |
| `CLIP_COS_BUCKET` / `CLIP_COS_REGION` | 存文件的桶 |
| `CLIP_COS_SECRET_ID` / `CLIP_COS_SECRET_KEY` | 只管这个桶的子账号 `clip`，线上边缘函数用的就是它 |
| `SITE_PASSWORD`（可选） | 站点密码；不写就沿用项目里已有的 |

站点密码存在项目的环境变量里，`smoke` 和 `backup` 会自己去取。

## 目录

```
src/
  shared/          前后端共用：数据模型（zod）、常量、待办、坐标、连线锚点
  server/
    edge.ts        边缘函数入口：接上 EdgeOne Blob 和 COS
    app.ts         把各组路由拼起来
    routes/        接口，按资源分：白板、元素、文件、快捷指令分享、登录等
    services/      业务规则：废纸篓和到期、文件接收（聊天记录压缩包）、自动排位、每天的清理
    repo/db.ts     元素数据的读写（对象布局写在文件开头）
    storage/       两种存储的接口和实现：Blob、COS（含签名）
  web/
    api/           带类型的接口客户端
    state/         数据同步、写操作入口、撤销栈、本机设置
    features/      按功能分：board（画布）、items（卡片）、links（连线）、location、sketch、sidebar、dialogs……
    lib/ ui/ styles/
scripts/           构建、部署、环境准备、冒烟、备份
tests/             接口和共用逻辑的测试（helpers.ts 里是内存版的两种存储）
```

## 几个决定

- **一个元素一个对象**。改元素只覆盖这次带来的字段；改文字带 `baseRev`，对不上回 409，前端让人选覆盖、另存或放弃。
- **同步**：每 5 秒先拿 `etags`（id + etag），只取变了的元素。
- **写操作只有一个入口**（`web/state/actions.ts`）：先改界面再排队发请求，失败回滚；新建元素的 id 由前端定，所以不用等服务端就能显示。撤销记的是每一步「怎么改回去」。
- **删除和到期都是挪进废纸篓**，在那里再留 30 天才真删；文件跟着元素走，真删时才删。
- **文件不经过边缘函数**：上传是浏览器拿预签名地址直接 PUT 到 COS，显示和下载是跳转到 COS 的临时地址（同一天内地址不变，浏览器能缓存）。只有要读像素的地方（在图片上画、复制图片、转 HEIC）走 `?raw=1` 由本站转发，避开跨域。
- **COS 签名是自己写的**（`server/storage/cos-sign.ts`）：边缘运行时的 `URLSearchParams` 不能遍历，现成的 aws4fetch 在上面跑不起来。
- **边缘函数只认 JS**：`scripts/build-edge.ts` 用 esbuild 打包，并把末尾的 `export{X as onRequest}` 改写成函数声明，否则平台认不出入口。
- **位置卡片的地图由浏览器直接取**：边缘节点连不上 OpenStreetMap。缩略图是把瓦片拼到画布上导出的一张图片，和地名一起只在卡片刚建好时取一次，存下来之后不再依赖地图服务。地名用 Photon（OpenStreetMap 数据，允许网页直接调）。
- **凡是要读很多元素的地方都分批**：边缘函数一次执行约 64 个请求就到头，超了存储返回 502；读一个元素有时算两个请求，线上实测一次读 32 个没事、34 个开始失败。常量 `BATCH` 是一批的大小；每天的清理（`services/cleanup.ts`）把进度记在存储里，定时任务每天推一批，页面打开时接着调到做完；边缘函数请求自己的域名会被平台回 404，没法自己接力。
- **后端留在边缘函数，不用云函数**：实测云函数没有上面的限制，但每个请求慢一倍、冷启动 2–3 秒、往外回数据只有约 170 KB/s。
- **文档预览交给 COS 数据万象**：封面是 `ci-process=doc-preview` 现转的第一页图片，翻看是它自带的在线阅读器，前端没有渲染代码。聊天记录压缩包超过 10 MB 不拆（边缘函数内存装不下）。
- **提醒只在页面开着时响**：定时任务最小间隔一天；每天 04:00 的定时任务只做清理。
- **iPhone 分享**：iOS 不支持 Web Share Target，改用快捷指令；它自己分清类型，分别调 `/api/share/text`、`/api/share/link`、`/api/share/location`、`/api/share/file`，服务端不猜内容；搭法在页面侧栏的 i 按钮里。
