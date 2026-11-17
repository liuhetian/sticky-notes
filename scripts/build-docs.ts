// 文档站：zensical 把 docs/ 构建到 build/dist/ai/，再把 src/docs/live.ts 打成它引用的 javascripts/live.js。
// 要在 vite 之后跑（vite 会清空 build/dist）。zensical 是 Python 写的，构建机要自己装，见下面的报错说明；
// 装在别处可以在 .env 里写 ZENSICAL=…/zensical
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';

if (existsSync('.env')) process.loadEnvFile('.env');

const zensical = process.env.ZENSICAL || 'zensical';
const t0 = Date.now();
const r = spawnSync(zensical, ['build', '--clean', '-f', 'zensical.toml'], { stdio: 'inherit' });
if (r.error && (r.error as NodeJS.ErrnoException).code === 'ENOENT') {
  throw new Error(
    `找不到 zensical（${zensical}）。文档站要用它构建，它需要 Python ≥ 3.11，任选一种装：\n` +
    '  uv tool install zensical==0.1.1\n' +
    '  pipx install zensical==0.1.1\n' +
    '装在别处（比如某个 venv 里）就在 .env 里写 ZENSICAL=/path/to/.venv/bin/zensical',
  );
}
if (r.status !== 0) throw new Error(`zensical 构建失败（退出码 ${r.status}）`);

await build({
  entryPoints: ['src/docs/live.ts'],
  outfile: 'build/dist/ai/javascripts/live.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
});
// zensical 顺带生成的每页 md 副本，占位符没替换，还被转义过：删掉，人和 AI 都去读实时版 /api/ai/<页>.md
const dropped: string[] = [];
for (const f of readdirSync('build/dist/ai', { recursive: true, encoding: 'utf8' })) {
  if (f.endsWith('.md')) { rmSync(join('build/dist/ai', f)); dropped.push(f); }
}
console.log(`✅ build/dist/ai：${((Date.now() - t0) / 1000).toFixed(1)} 秒；删掉静态 md 副本 ${dropped.join('、') || '无'}`);
