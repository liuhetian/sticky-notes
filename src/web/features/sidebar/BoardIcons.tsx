// 手画的白板图标，按名字认：共用（两个人）、牛牛（奶牛）、香蕉、大米（小熊脑袋）；系统白板按 id 认：故障（警示牌）、废纸篓（塞着便利贴的纸篓）。
// 其余白板画一张写着名字首字的小便利贴，和手画的一样大，名字才对得齐
import { FAULTS, TRASH } from '@/shared/constants';

const Shared = () => (
  <svg viewBox="0 0 32 32" aria-hidden>
    <circle cx="11.5" cy="11" r="4.6" fill="#7db8f0" />
    <path d="M3.5 25.5c0-5.6 3.6-8.3 8-8.3s8 2.7 8 8.3z" fill="#7db8f0" />
    <circle cx="21.6" cy="12.2" r="4.1" fill="#f3ab5a" />
    <path d="M14.8 26c.5-4.6 3.2-7.2 6.8-7.2 4 0 7.1 2.6 7.1 7.2z" fill="#f3ab5a" />
    <circle cx="10" cy="10.4" r=".9" fill="#fff" opacity=".7" />
  </svg>
);

const Cow = () => (
  <svg viewBox="0 0 32 32" aria-hidden>
    <path d="M8.2 9.6C6 7.4 5.6 5 6.6 3.4c.9 2.2 2.6 3.7 4.8 4.6z" fill="#efe3c8" stroke="#8a7a5c" strokeWidth=".8" />
    <path d="M23.8 9.6c2.2-2.2 2.6-4.6 1.6-6.2-.9 2.2-2.6 3.7-4.8 4.6z" fill="#efe3c8" stroke="#8a7a5c" strokeWidth=".8" />
    <ellipse cx="5" cy="13.2" rx="4" ry="2.3" fill="#3d3a36" transform="rotate(-18 5 13.2)" />
    <ellipse cx="27" cy="13.2" rx="4" ry="2.3" fill="#3d3a36" transform="rotate(18 27 13.2)" />
    <path d="M7.6 11C9.6 7.6 22.4 7.6 24.4 11c1.6 3.4 1.2 8.4-1.2 11.2H8.8C6.4 19.4 6 14.4 7.6 11z" fill="#fff" stroke="#3d3a36" strokeWidth="1.3" />
    <path d="M9.4 10.2c1.6-1.6 4.4-1.4 5.2.8.4 1.8-1.2 3.4-3.2 3.2-1.8-.2-2.8-2.4-2-4z" fill="#3d3a36" />
    <path d="M20.6 9.2c1.2-.4 2.6.2 2.8 1.4.1.9-.8 1.6-1.8 1.4-1-.2-1.8-1.9-1-2.8z" fill="#3d3a36" />
    <circle cx="12.4" cy="15.4" r="1.25" fill="#2d2a25" />
    <circle cx="19.6" cy="15.4" r="1.25" fill="#2d2a25" />
    <ellipse cx="16" cy="22.6" rx="7.2" ry="4.6" fill="#f7b8c6" stroke="#3d3a36" strokeWidth="1.3" />
    <ellipse cx="13.4" cy="22.6" rx="1.1" ry="1.5" fill="#3d3a36" />
    <ellipse cx="18.6" cy="22.6" rx="1.1" ry="1.5" fill="#3d3a36" />
  </svg>
);

const Banana = () => (
  <svg viewBox="0 0 32 32" aria-hidden>
    <path d="M7.4 6.6C4.6 17.4 11.6 27.6 22.8 26.4c3.4-.4 5.4-1.8 5.9-3.4-3.6.9-8.6.6-13-2.9C11.4 16.6 9.6 12 9.4 7z" fill="#f7d44c" stroke="#b8891c" strokeWidth="1.2" strokeLinejoin="round" />
    <path d="M10.2 11.6c1.8 5.6 5.4 9.4 12.6 11.2" fill="none" stroke="#e2b42e" strokeWidth="1.1" strokeLinecap="round" />
    <path d="M9.4 7 8.6 4c-.2-.7-1.3-.6-1.4.1L7.4 6.6z" fill="#7a5a1c" />
    <path d="m28.7 23 1.2-.3c.5-.1.5-.9 0-1l-1.2.1z" fill="#5c4314" />
    <path d="M13 17.6c.4.6.9 1.1 1.4 1.6" stroke="#fff" strokeWidth="1" strokeLinecap="round" opacity=".55" />
  </svg>
);

const Bear = () => (
  <svg viewBox="0 0 32 32" aria-hidden>
    <circle cx="7.8" cy="9.2" r="4.5" fill="#b77a4b" stroke="#5a3a22" strokeWidth="1.2" />
    <circle cx="24.2" cy="9.2" r="4.5" fill="#b77a4b" stroke="#5a3a22" strokeWidth="1.2" />
    <circle cx="8" cy="9.4" r="2.2" fill="#f0c3a4" />
    <circle cx="24" cy="9.4" r="2.2" fill="#f0c3a4" />
    <ellipse cx="16" cy="17.8" rx="11.4" ry="10.2" fill="#c98b58" stroke="#5a3a22" strokeWidth="1.3" />
    <path d="M9.6 11.6c1.7-1.5 3.8-2.2 6-2.2" fill="none" stroke="#fff" strokeWidth="1.1" strokeLinecap="round" opacity=".35" />
    <ellipse cx="16" cy="21.6" rx="5.3" ry="4.1" fill="#f5e1c6" stroke="#5a3a22" strokeWidth="1" />
    <path d="M13.9 19.5c0-1 4.2-1 4.2 0 0 1.1-1.3 2-2.1 2s-2.1-.9-2.1-2z" fill="#3a271b" />
    <path d="M16 21.4v1.1m0 0c-.5.8-1.6.9-2.2.3m2.2-.3c.5.8 1.6.9 2.2.3" fill="none" stroke="#3a271b" strokeWidth=".9" strokeLinecap="round" />
    <circle cx="11.5" cy="15.8" r="1.35" fill="#2d2a25" />
    <circle cx="20.5" cy="15.8" r="1.35" fill="#2d2a25" />
    <circle cx="11.95" cy="15.3" r=".42" fill="#fff" />
    <circle cx="20.95" cy="15.3" r=".42" fill="#fff" />
    <ellipse cx="8.9" cy="19.9" rx="1.7" ry="1" fill="#f08f8f" opacity=".5" />
    <ellipse cx="23.1" cy="19.9" rx="1.7" ry="1" fill="#f08f8f" opacity=".5" />
  </svg>
);

const Fault = () => (
  <svg viewBox="0 0 32 32" aria-hidden>
    <path d="M14.3 4.6a2 2 0 0 1 3.4 0l11 19a2 2 0 0 1-1.7 3H5a2 2 0 0 1-1.7-3z" fill="#ffb3a7" stroke="#c0473a" strokeWidth="1.4" strokeLinejoin="round" />
    <path d="M12.8 9.6 9.4 15.5" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" opacity=".6" />
    <path d="M16 11.4v7.2" stroke="#7a2219" strokeWidth="2.6" strokeLinecap="round" />
    <circle cx="16" cy="22.4" r="1.5" fill="#7a2219" />
  </svg>
);

const Trash = () => (
  <svg viewBox="0 0 32 32" aria-hidden>
    <path d="M9.4 11.2 8.4 5.6l3.8-3.2 3.1 1.9 3.8-2.3 3.6 3.1-1 4 1.2 2.1z" fill="#fff2a8" stroke="#d4ae2c" strokeWidth="1.1" strokeLinejoin="round" />
    <path d="M12.2 2.6 13.8 7l4-1.1 1.2 4.4" fill="none" stroke="#e2bf45" strokeWidth=".9" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7.6 12.2h16.8l-1.6 14.6a2 2 0 0 1-2 1.8h-9.6a2 2 0 0 1-2-1.8z" fill="#dde4ea" stroke="#5f6b75" strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M12.4 15.6l.5 9.4M16 15.6v9.4M19.6 15.6l-.5 9.4" stroke="#5f6b75" strokeWidth="1" strokeLinecap="round" opacity=".5" />
    <rect x="5.8" y="10" width="20.4" height="2.8" rx="1.4" fill="#eef2f5" stroke="#5f6b75" strokeWidth="1.3" />
  </svg>
);

const ICONS: Record<string, () => React.JSX.Element> = { 共用: Shared, 牛牛: Cow, 香蕉: Banana, 大米: Bear };
/** 系统白板不能改名，按 id 认 */
const SYSTEM: Record<string, () => React.JSX.Element> = { [FAULTS]: Fault, [TRASH]: Trash };

// 便利贴的浅色和深色（styles/base.css 里那几种，白色除外）；按 id 挑，删了别的白板颜色也不变
const NOTE_COLORS = [
  ['#fff2a8', '#f6d955'], ['#ffdbe4', '#f5a6bc'], ['#d6ebff', '#8cc2f3'],
  ['#dbf4d3', '#9bd78b'], ['#e9e0fe', '#bea8f3'], ['#ffe2bf', '#f5b26a'],
] as const;
const colorOf = (id: string) => NOTE_COLORS[([...id].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0) % NOTE_COLORS.length];

const Note = ({ ch, color: [bg, edge] }: { ch: string; color: readonly [string, string] }) => (
  <svg viewBox="0 0 32 32" aria-hidden>
    <g transform="rotate(-5 16 16)">
      <path d="M3.5 3.5h25v18l-7 7h-18z" fill={bg} stroke={edge} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M28.5 21.5h-7v7z" fill={edge} stroke={edge} strokeWidth="1.4" strokeLinejoin="round" />
      <text x="15.2" y="15.4" textAnchor="middle" dominantBaseline="central" fontSize="16" fontWeight="700" fill="#4a4031">{ch}</text>
    </g>
  </svg>
);

export function BoardIcon({ id, name }: { id: string; name: string }) {
  const Svg = SYSTEM[id] ?? ICONS[name];
  return <span className="board-icon">{Svg ? Svg() : <Note ch={[...name][0] ?? ''} color={colorOf(id)} />}</span>;
}
