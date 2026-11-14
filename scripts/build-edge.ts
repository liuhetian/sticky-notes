// 边缘函数只认 JavaScript：把 src/server/edge.ts 连同依赖打成一个文件
import { build } from 'esbuild';
import { readFileSync, statSync, writeFileSync } from 'node:fs';

const outfile = 'build/edge-functions/api/[[default]].js';
await build({
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
console.log(`✅ ${outfile}：${kb.toFixed(0)} KB`);
