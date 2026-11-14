// 连线的形状：一条微微弯的线，中间绕一个小圈，再交给 roughjs 加上手画的抖动
import rough from 'roughjs';
import type { Pos } from '@/shared/layout';

/** 没抖动的底稿：点击判定用它 */
export function curlyPath(p: Pos, q: Pos, seed: number): string {
  const dx = q.x - p.x, dy = q.y - p.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return `M ${p.x} ${p.y} L ${q.x} ${q.y}`;
  const u = { x: dx / len, y: dy / len };
  // 往哪一侧弯由 seed 定：同一条线每次画出来都一样，不同的线各弯各的
  const side = seed % 2 ? 1 : -1;
  const n = { x: -u.y * side, y: u.x * side };
  const at = (along: number, off: number) => `${(p.x + u.x * along + n.x * off).toFixed(1)} ${(p.y + u.y * along + n.y * off).toFixed(1)}`;
  const bow = Math.min(26, len * 0.07);
  if (len < 70) return `M ${p.x} ${p.y} Q ${at(len / 2, bow)} ${q.x} ${q.y}`;
  const r = Math.max(6, Math.min(11, len * 0.05));
  const mid = len / 2;
  // 小圈：两个控制点交叉着甩到同一侧，曲线自己绕一圈
  return [
    `M ${p.x} ${p.y}`,
    `Q ${at(len * 0.25, bow * 1.4)} ${at(mid - r * 0.5, bow * 0.5)}`,
    `C ${at(mid + r * 2.6, bow * 0.5 - r * 3.2)} ${at(mid - r * 2.6, bow * 0.5 - r * 3.2)} ${at(mid + r * 0.5, bow * 0.5)}`,
    `Q ${at(len * 0.75, bow * 1.2)} ${q.x} ${q.y}`,
  ].join(' ');
}

const gen = rough.generator();
const cache = new Map<string, string[]>();

/** 手画效果的路径（可能有好几段）；同样的输入结果一样，拖动时不会乱抖 */
export function sketchy(d: string, seed: number): string[] {
  const key = `${seed}|${d}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const drawable = gen.path(d, { seed: seed + 1, roughness: 0.7, bowing: 0.6, disableMultiStroke: true, preserveVertices: true });
  const out = gen.toPaths(drawable).map((x) => x.d);
  if (cache.size > 400) cache.clear();
  cache.set(key, out);
  return out;
}

export const seedOf = (id: string) => Number.parseInt(id.slice(0, 6), 16) || 1;
