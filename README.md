# 牛牛便利贴

https://clip.liuhetian.life ：这台设备粘贴，那台设备拿走。功能和规则见 [docs/requirements.md](docs/requirements.md)，以它为准。wiki（项目文档和给 AI 的接口说明）在 https://clip.liuhetian.life/wiki/ （源文件 `docs/`，入口 `docs/index.md`，接口说明 `docs/ai-api.md`），按 [test-wiki 的子服务规范](../test-wiki/main-wiki/docs/new-subservice.md) 接入主 wiki。

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
