import clsx from 'clsx';

// 站点标志：两张叠着的便利贴，前面那张贴了和纸胶带、右下角卷起。
// 坐标系 64×64；scripts/icons.ts 也拿它生成 favicon 和 PWA 图标，改完跑 npm run icons。
// 不用渐变/滤镜：它们靠 id 引用，侧栏收起时那份 svg 被 display:none 会让别处的引用失效
export const LOGO_MARK = `
<rect x="25" y="5" width="33" height="33" rx="3" fill="#8cc4f2" transform="rotate(10 41.5 21.5)"/>
<g transform="rotate(-6 26 36)">
  <path d="M7 17h38v28L35 55H7z" fill="#5a4320" opacity=".14" transform="translate(1 1.8)"/>
  <path d="M7 17h38v28L35 55H7z" fill="#ffd54f"/>
  <path d="M7 17h38v4H7z" fill="#f4c43c" opacity=".55"/>
  <path d="M35 55c.3-3.2.2-6.4 1-8.3.6-1.2 3.5-1.5 9-1.7z" fill="#5a4320" opacity=".12" transform="translate(-1 -1)"/>
  <path d="M35 55c.3-3.2.2-6.4 1-8.3.6-1.2 3.5-1.5 9-1.7z" fill="#e9ae2c"/>
  <g fill="none" stroke="#8a6a1e" stroke-width="2.2" stroke-linecap="round">
    <path d="M13.5 30c2.4-1.2 4.8 1 7.2 0s4.8 1 7.2 0 4.2.9 6.6.2"/>
    <path d="M13.5 38c2.4-1.2 4.8 1 7.2 0s4.2.9 6.6.2"/>
  </g>
  <path d="M16 12.5l1 1.2-1 1.2 1 1.2-1 1.2 1 1.2-1 1.2h19l-1-1.2 1-1.2-1-1.2 1-1.2-1-1.2 1-1.2z" fill="#f59ab4" opacity=".9" transform="rotate(-5 26 16)"/>
</g>`;

export function Logo({ className }: { className?: string }) {
  return <svg className={clsx('logo', className)} viewBox="0 0 64 64" aria-hidden="true" dangerouslySetInnerHTML={{ __html: LOGO_MARK }} />;
}
