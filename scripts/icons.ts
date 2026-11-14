// 从 Logo.tsx 的图形生成图标；只在改图标时跑
// icon.svg 是浏览器标签页的 favicon，只画便利贴本身，小尺寸更清楚；
// PNG 给 PWA 和 iPhone 主屏幕用，垫一块带点阵的纸色底。apple-touch-icon 必须是直角满铺，圆角由 iOS 自己裁
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';
import { LOGO_MARK } from '../src/web/ui/Logo';

const dir = 'src/web/public/icons';
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${LOGO_MARK}</svg>\n`;
const tile = (rx: number) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><pattern id="dot" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="16" cy="16" r="2.4" fill="#e0d8c6"/></pattern></defs>
  <rect width="512" height="512" rx="${rx}" fill="#f5f2ea"/>
  <rect width="512" height="512" rx="${rx}" fill="url(#dot)"/>
  <g transform="translate(66 74) scale(5.9)">${LOGO_MARK}</g>
</svg>`;

writeFileSync(`${dir}/icon.svg`, favicon);
console.log('icon.svg');
for (const [name, size, rx] of [['icon-192.png', 192, 112], ['icon-512.png', 512, 112], ['apple-touch-icon.png', 180, 0]] as const) {
  writeFileSync(`${dir}/${name}`, new Resvg(tile(rx), { fitTo: { mode: 'width', value: size } }).render().asPng());
  console.log(`${name} ${size}px`);
}
