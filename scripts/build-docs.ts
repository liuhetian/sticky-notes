// wiki：deploy.sh 按规范把 docs/ 构建到 site/，这里再把它放进 build/dist/wiki/ 准备上线。要在 vite 之后跑（vite 会清空 build/dist）。
// 不上传 .md：EdgeOne 上静态文件优先于边缘函数，传上去就会盖住函数渲染的 /wiki/x.md（src/server/wiki.ts）
import { spawnSync } from 'node:child_process';
import { cpSync, readFileSync, readdirSync, rmSync } from 'node:fs';

const t0 = Date.now();
const r = spawnSync('bash', ['deploy.sh'], { stdio: 'inherit' });
if (r.status !== 0) throw new Error(`deploy.sh 失败（退出码 ${r.status}）：要有兄弟目录 test-wiki 并在里面 uv sync 过，或者设 WIKI_ROOT`);

rmSync('build/dist/wiki', { recursive: true, force: true });
cpSync('site', 'build/dist/wiki', { recursive: true, filter: (src) => !src.endsWith('.md') });

// /wiki/x 不带斜杠时平台直接返回页面、不跳转，页面里的相对地址（样式、live.js、alternate 的 ../x.md）就解析错了：
// 每个页面都要在 edgeone.json 里有一条 /wiki/x → /wiki/x/ 的 301
const redirects = new Set((JSON.parse(readFileSync('edgeone.json', 'utf8')).redirects as { source: string }[]).map((x) => x.source));
const missing = readdirSync('site', { recursive: true, encoding: 'utf8' })
  .filter((f) => f.endsWith('/index.html') && !f.startsWith('search/'))
  .map((f) => `/wiki/${f.slice(0, -'/index.html'.length)}`)
  .filter((p) => !redirects.has(p));
if (missing.length) throw new Error(`edgeone.json 缺少跳转：${missing.map((p) => `${p} → ${p}/`).join('、')}`);

console.log(`✅ build/dist/wiki：${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
