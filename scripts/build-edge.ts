// 边缘函数只认 JavaScript：把 src/server/edge.ts 连同依赖打成一个文件，放到 /api/ 和 /wiki/ 两个入口（同一个包，按路径分发）
import { build, type Plugin } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// `import x from './a.md?raw'` 把文件内容当字符串打进包（和 vite/vitest 的 ?raw 一样）：给 AI 读的文档原文就是这么进函数的
const raw: Plugin = {
  name: 'raw',
  setup(b) {
    b.onResolve({ filter: /\?raw$/ }, (a) => ({ path: resolve(a.resolveDir, a.path.slice(0, -4)), namespace: 'raw' }));
    b.onLoad({ filter: /.*/, namespace: 'raw' }, (a) => ({ contents: readFileSync(a.path, 'utf8'), loader: 'text' }));
  },
};

const outfile = 'build/edge-functions/api/[[default]].js';
const { metafile } = await build({
  metafile: true,
  plugins: [raw],
  entryPoints: ['src/server/edge.ts'],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  mainFields: ['module', 'main'],
  conditions: ['worker', 'browser', 'import'],
  minify: true,
  legalComments: 'none',
});
// 平台按字面扫描入口：压缩后的 `export{X as onRequest}` 认不出来，改写成函数声明
const code = readFileSync(outfile, 'utf8');
const m = code.match(/export\s*\{\s*([\w$]+)\s+as\s+onRequest\s*\};?\s*$/);
if (!m) throw new Error('打包结果里找不到 onRequest 导出');
writeFileSync(outfile, code.slice(0, m.index) + `export async function onRequest(context){return ${m[1]}(context)}\n`);
const kb = statSync(outfile).size / 1024;
if (kb > 5 * 1024) throw new Error(`边缘函数包 ${kb.toFixed(0)} KB，超过 5 MB 上限`);
// 包越大冷启动越慢，冷启动超过平台的 CPU 上限就回 545（docs/dev.md「平台的坑」）。
// zod 写成 import { z } from 'zod' 会整个打进来（400 多 KB），写成 import * as z 只有 100 KB 左右
const zodKb = Object.entries(metafile.outputs[outfile].inputs)
  .filter(([path]) => path.includes('node_modules/zod/'))
  .reduce((sum, [, v]) => sum + v.bytesInOutput, 0) / 1024;
if (zodKb > 150) throw new Error(`边缘函数包里 zod 占了 ${zodKb.toFixed(0)} KB：zod 要写成 import * as z from 'zod'`);
// /wiki/ 下有静态文件的路径（页面）平台直接给静态文件，落到函数的只有 .md
const wikiEntry = 'build/edge-functions/wiki/[[default]].js';
mkdirSync('build/edge-functions/wiki', { recursive: true });
copyFileSync(outfile, wikiEntry);
console.log(`✅ ${outfile}、${wikiEntry}：${kb.toFixed(0)} KB`);
