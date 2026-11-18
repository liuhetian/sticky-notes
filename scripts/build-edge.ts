// 边缘函数只认 JavaScript：把 src/server/edge.ts 连同依赖打成一个文件，放在顶层一个入口 [[default]].js，
// 接住所有没对上静态文件的路径，函数里按路径分发。首页 build/dist/index.html 也打进包（前端路由回首页用），所以要在 build:web 之后跑
import { build, type Plugin } from 'esbuild';
import { readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// `import x from './a.md?raw'` 把文件内容当字符串打进包（和 vite/vitest 的 ?raw 一样）：给 AI 读的文档原文就是这么进函数的
const raw: Plugin = {
  name: 'raw',
  setup(b) {
    b.onResolve({ filter: /\?raw$/ }, (a) => ({ path: resolve(a.resolveDir, a.path.slice(0, -4)), namespace: 'raw' }));
    b.onLoad({ filter: /.*/, namespace: 'raw' }, (a) => ({ contents: readFileSync(a.path, 'utf8'), loader: 'text' }));
  },
};

// 先清空：edge-functions/ 下留着的每个文件都会被部署成一个入口
rmSync('build/edge-functions', { recursive: true, force: true });
const outfile = 'build/edge-functions/[[default]].js';
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
// 代码越多冷启动越慢，冷启动超过平台的 CPU 上限就回 545（docs/dev.md「平台的坑」）：超预算就别上线，先看是谁变大了。
// 预算只算代码：?raw 打进来的文字（文档原文、首页）实测不拖累冷启动，不算
// 常见的是 zod 写成 import { z } from 'zod'，整个命名空间连同几十种语言的报错文案都打进来（400 多 KB）
const BUDGET_KB = 350;
const inputs = metafile.outputs[outfile].inputs;
const textKb = Object.entries(inputs).filter(([path]) => path.startsWith('raw:')).reduce((sum, [, v]) => sum + v.bytesInOutput, 0) / 1024;
const codeKb = kb - textKb;
const top = Object.entries(
  Object.entries(inputs).reduce<Record<string, number>>((sum, [path, v]) => {
    const key = path.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1] ?? (path.startsWith('raw:') ? '打进来的文字（不算预算）' : path.split('/').slice(0, 3).join('/'));
    sum[key] = (sum[key] ?? 0) + v.bytesInOutput;
    return sum;
  }, {}),
).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ${(v / 1024).toFixed(0)} KB`).join('、');
if (codeKb > BUDGET_KB) throw new Error(`边缘函数包里的代码 ${codeKb.toFixed(0)} KB，超过预算 ${BUDGET_KB} KB。最大的几项：${top}`);
console.log(`✅ ${outfile}：${kb.toFixed(0)} KB，其中代码 ${codeKb.toFixed(0)} KB（预算 ${BUDGET_KB} KB）。最大的几项：${top}`);
