// 撤销：只记本机这次打开页面以来自己做的操作，刷新就清空。每一步记的是「怎么改回去」
import { toast } from 'sonner';

export type UndoEntry = { label: string; run: () => Promise<unknown> };

const MAX = 100;
const stack: UndoEntry[] = [];

export function pushUndo(entry: UndoEntry) {
  stack.push(entry);
  if (stack.length > MAX) stack.shift();
  return entry;
}

async function perform(entry: UndoEntry) {
  try {
    await entry.run();
    toast(`已撤销：${entry.label}`);
  } catch (e) {
    toast.error(`没撤销成：${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Ctrl/Cmd+Z */
export function undoLast() {
  const entry = stack.pop();
  if (!entry) { toast('没有可以撤销的操作'); return; }
  return perform(entry);
}

/** 提示条上的「撤销」按钮：撤销指定的那一步 */
export function undoEntry(entry: UndoEntry) {
  const i = stack.indexOf(entry);
  if (i < 0) return;
  stack.splice(i, 1);
  return perform(entry);
}
