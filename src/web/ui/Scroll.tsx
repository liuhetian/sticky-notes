// 自己画的滚动条（OverlayScrollbars）：滚动条是页面里的普通元素，跟着卡片一起转、一起缩放。
// 浏览器原生的滚动条放在转了角度的卡片里会错位。还是原生滚动（触控板、手机手势照常），只是把滚动条换掉
import type { PartialOptions } from 'overlayscrollbars';
import { OverlayScrollbarsComponent } from 'overlayscrollbars-react';
import type { ComponentPropsWithoutRef } from 'react';

// 放在模块里：每次渲染传新对象，库会以为选项变了、重新设置一遍
const OPTIONS: PartialOptions = {
  overflow: { x: 'hidden' },
  scrollbars: { theme: 'os-theme-paper', autoHide: 'leave', autoHideDelay: 300, clickScroll: true },
};

/** 内容超出高度时出现滚动条；鼠标移开就收起来 */
export function Scroll(props: ComponentPropsWithoutRef<'div'>) {
  // 白板上可能有几十张便利贴：等浏览器空下来再初始化，打开白板不卡
  return <OverlayScrollbarsComponent options={OPTIONS} defer {...props} />;
}
