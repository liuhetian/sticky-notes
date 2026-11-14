// 便利贴里的待办：`- [ ] xx` 或行首直接写 `[ ] xx`；代码块里的不算
const TASK = /^(\s*)(?:([-*+]|\d+[.)])\s+)?\[([ xX])\]\s+/;

function eachLine(text: string, fn: (line: string, i: number) => void) {
  let fence = false;
  text.split('\n').forEach((raw, i) => {
    const line = raw.replace(/\r$/, '');
    if (/^\s*```/.test(line)) { fence = !fence; return; }
    if (!fence) fn(line, i);
  });
}

export function countTasks(text: string): { total: number; done: number } {
  let total = 0, done = 0;
  eachLine(text, (line) => {
    const m = line.match(TASK);
    if (m) { total++; if (m[3] !== ' ') done++; }
  });
  return { total, done };
}

export const allTasksDone = (text: string) => {
  const t = countTasks(text);
  return t.total > 0 && t.done === t.total;
};

/** 勾选或取消第 line 行（从 0 数）的待办 */
export function toggleTaskLine(text: string, line: number, checked: boolean): string {
  const lines = text.split('\n');
  if (lines[line] === undefined || !TASK.test(lines[line])) return text;
  lines[line] = lines[line].replace(/\[( |x|X)\]/, checked ? '[x]' : '[ ]');
  return lines.join('\n');
}

/** 行首直接写的 `[ ] xx` 补成 `- [ ] xx`，交给 markdown 渲染成复选框；行数不变，行号还能对上 */
export function normalizeBareTasks(text: string): string {
  const out: string[] = [];
  let fence = false;
  for (const line of text.split('\n')) {
    if (/^\s*```/.test(line)) fence = !fence;
    out.push(!fence && /^\s*\[[ xX]\]\s/.test(line) ? line.replace(/^(\s*)/, '$1- ') : line);
  }
  return out.join('\n');
}

/**
 * 在待办那一行的末尾按回车：下一行自动续一个空待办；这一行本来就是空待办，就把它清掉（结束列表）。
 * 返回要把 [from, to) 换成 insert；不是这种情况返回 null，照常换行
 */
export function continueTask(value: string, caret: number): { from: number; to: number; insert: string } | null {
  const start = value.lastIndexOf('\n', caret - 1) + 1;
  const line = value.slice(start, caret);
  const m = line.match(TASK);
  if (!m) return null;
  if (line.length === m[0].length) return { from: start, to: caret, insert: '' };
  const bullet = m[2] === undefined ? '' : /\d/.test(m[2]) ? `${Number.parseInt(m[2], 10) + 1}${m[2].slice(-1)} ` : `${m[2]} `;
  return { from: caret, to: caret, insert: `\n${m[1]}${bullet}[ ] ` };
}
