// 连线锚点里和 DOM 无关的部分：便利贴被改过以后，线原来接的那一行现在在哪
import type { Anchor } from './schema';

export type LineAnchor = Extract<Anchor, { line: number }>;
export type PointAnchor = Extract<Anchor, { px: number }>;
export const isLineAnchor = (a: Anchor | undefined): a is LineAnchor => !!a && 'line' in a;
export const isPointAnchor = (a: Anchor | undefined): a is PointAnchor => !!a && 'px' in a;

const hintOf = (line: string) => line.trim().slice(0, 80);

/** 给第 line 行（从 0 数）做一个锚点；空行没法认，返回 null */
export function lineAnchor(text: string, line: number): LineAnchor | null {
  const hint = hintOf(text.split('\n')[line] ?? '');
  return hint ? { line, hint } : null;
}

/** 锚点现在指向第几行：原行号上还是那句话就用原行号；被挪走了就找内容一样的那一行；找不到返回 null（改连整张便利贴） */
export function resolveLine(text: string, a: LineAnchor): number | null {
  const lines = text.split('\n');
  if (hintOf(lines[a.line] ?? '') === a.hint) return a.line;
  const i = lines.findIndex((l) => hintOf(l) === a.hint);
  return i < 0 ? null : i;
}

export const sameAnchor = (x?: Anchor, y?: Anchor) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
