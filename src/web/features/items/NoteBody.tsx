// 便利贴正文：react-markdown + GFM（待办列表）+ 换行保留；不渲染原文里的 HTML。
// 每个块都带上它在原文里的起始行号和行数（data-line / data-lines）：勾待办、连线接到某一行都靠它定位
import { createContext, createElement, useContext, useEffect, useRef, useState, type ComponentProps } from 'react';
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { continueTask, normalizeBareTasks } from '@/shared/todo';
import { useMobile } from '../../lib/hooks';

const LineCtx = createContext<number | null>(null);
const ToggleCtx = createContext<((line: number, checked: boolean) => void) | null>(null);

function TaskBox(props: ComponentProps<'input'>) {
  const line = useContext(LineCtx);
  const toggle = useContext(ToggleCtx);
  if (props.type !== 'checkbox') return <input {...props} />;
  return (
    <input type="checkbox" checked={!!props.checked} disabled={!toggle || line === null}
      onChange={(e) => line !== null && toggle?.(line, e.target.checked)}
      onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} />
  );
}

const lineProps = (node: ExtraProps['node']) => {
  const pos = node?.position;
  return pos ? { 'data-line': pos.start.line - 1, 'data-lines': pos.end.line - pos.start.line + 1 } : {};
};
const block = (tag: string) => ({ node, ...p }: ExtraProps & Record<string, unknown>) => createElement(tag, { ...p, ...lineProps(node) });

const components: Components = {
  a: ({ node: _n, ...p }) => <a {...p} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} />,
  li: ({ node, children, ...p }) => (
    <li {...p} {...lineProps(node)}>
      <LineCtx.Provider value={node?.position ? node.position.start.line - 1 : null}>{children}</LineCtx.Provider>
    </li>
  ),
  input: ({ node: _n, ...p }) => <TaskBox {...p} />,
  ...Object.fromEntries(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'tr'].map((t) => [t, block(t)])),
};

export function Markdown({ text, onToggle }: { text: string; onToggle?: (line: number, checked: boolean) => void }) {
  if (!text.trim()) return <p className="placeholder">空白便利贴，双击写点什么</p>;
  return (
    <ToggleCtx.Provider value={onToggle ?? null}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>{normalizeBareTasks(text)}</ReactMarkdown>
    </ToggleCtx.Provider>
  );
}

/** 用浏览器自己的编辑命令改文字，这样 Ctrl+Z 还能撤回；不支持时直接改值 */
function replaceRange(ta: HTMLTextAreaElement, from: number, to: number, insert: string) {
  ta.setSelectionRange(from, to);
  const ok = insert ? document.execCommand('insertText', false, insert) : from === to || document.execCommand('delete');
  if (!ok) ta.setRangeText(insert, from, to, 'end');
}

export function NoteEditor({ initial, onDone }: { initial: string; onDone: (text: string | null) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const finished = useRef(false);
  /** 改过还没存：编辑框下面亮出「未保存」和保存按钮 */
  const [dirty, setDirty] = useState(false);
  // 手机上收起键盘就是失焦、自动保存，用不着按钮
  const mobile = useMobile();
  const finish = (text: string | null) => {
    if (finished.current) return;
    finished.current = true;
    onDone(text);
  };
  const autosize = () => {
    const ta = ref.current!;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 480)}px`;
  };
  useEffect(() => {
    const ta = ref.current!;
    autosize();
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }, []);
  return (
    <>
    <textarea ref={ref} className="editor" defaultValue={initial}
      placeholder={'写点什么……\n支持 **粗体**、`代码`、[名称](链接)、- [ ] 待办\nCtrl+Enter 保存，Esc 取消'}
      onInput={(e) => { autosize(); setDirty(e.currentTarget.value !== initial); }}
      onKeyDown={(e) => {
        const ta = e.currentTarget;
        if (e.key === 'Escape') { e.preventDefault(); finish(null); }
        else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); finish(ta.value); }
        // 待办那一行按回车：下一行自动续一个待办（输入法选字时的回车不算）
        else if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.nativeEvent.isComposing && ta.selectionStart === ta.selectionEnd) {
          const r = continueTask(ta.value, ta.selectionStart);
          if (!r) return;
          e.preventDefault();
          replaceRange(ta, r.from, r.to, r.insert);
          autosize();
          setDirty(ta.value !== initial);
        }
      }}
      // 点工具栏按钮也会先失焦；稍等一下，让按钮的点击先跑完
      onBlur={(e) => { const v = e.currentTarget.value; setTimeout(() => { if (document.activeElement !== ref.current) finish(v); }, 120); }}
    />
    {dirty && (
      <div className="unsaved">
        <span>未保存</span>
        {/* 按下时不让编辑框失焦，免得和「点外面保存」抢 */}
        {!mobile && <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); finish(ref.current!.value); }}>保存</button>}
      </div>
    )}
    </>
  );
}
