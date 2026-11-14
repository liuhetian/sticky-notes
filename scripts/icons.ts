// 从 icon.svg 生成 PNG 图标（iPhone 加到主屏幕用 apple-touch-icon）；只在改图标时跑
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';

const dir = 'src/web/public/icons';
const svg = readFileSync(`${dir}/icon.svg`, 'utf8');
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]] as const) {
  writeFileSync(`${dir}/${name}`, new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng());
  console.log(`${name} ${size}px`);
}
