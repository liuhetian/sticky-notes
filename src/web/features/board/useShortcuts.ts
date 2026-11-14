// 电脑上的快捷键：V / H 切工具，按住空格临时变抓手，Delete 删所选，Esc 取消，Ctrl/Cmd+Z 撤销
import { isTyping, useEvent } from '../../lib/hooks';
import { sketchStore } from '../../state/stores';
import { undoLast } from '../../state/undo';

export function useShortcuts(enabled: boolean, on: {
  tool: (t: 'select' | 'hand') => void;
  /** 空格按下、松开 */
  space: (down: boolean) => void;
  /** 删掉选中的东西；没有可删的返回 false */
  del: () => boolean;
  escape: () => void;
}) {
  useEvent<KeyboardEvent>(window, 'keydown', (e) => {
    // 正在打字时这些键都归输入框（Ctrl+Z 撤销的是打的字）；画布编辑器开着时归它
    if (isTyping(e.target) || sketchStore.get()) return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undoLast(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === 'v') on.tool('select');
    else if (key === 'h') on.tool('hand');
    else if (key === ' ') { e.preventDefault(); on.space(true); }
    else if ((key === 'delete' || key === 'backspace') && on.del()) e.preventDefault();
    else if (key === 'escape') on.escape();
  }, enabled);
  useEvent<KeyboardEvent>(window, 'keyup', (e) => { if (e.key === ' ') on.space(false); }, enabled);
  useEvent(window, 'blur', () => on.space(false), enabled);
}
