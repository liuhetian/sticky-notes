// 改文字时别人刚改过：两份并排，自己选
import type { Actions } from '../../state/actions';
import { conflictStore } from '../../state/stores';
import { Markdown } from '../items/NoteBody';
import { Shell } from './Shell';

export function ConflictDialog({ actions }: { actions: Actions }) {
  const c = conflictStore.use();
  const close = () => conflictStore.set(null);
  return (
    <Shell open={!!c} onClose={close} className="conflict" title="这张便利贴刚被别人改过">
      {c && (
        <>
          <div className="conflict-cols">
            <div><div className="mlabel">对方的（现在存着的）</div><div className={`note-preview ${c.theirs.color}`}><div className="md"><Markdown text={c.theirs.text} boardId={c.boardId} /></div></div></div>
            <div><div className="mlabel">你刚写的</div><div className="note-preview mine"><pre>{c.mine}</pre></div></div>
          </div>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={close}>用对方的</button>
            <button type="button" className="btn" onClick={() => {
              actions.create(c.boardId, { type: 'note', text: c.mine, color: c.theirs.color, x: c.theirs.x + 36, y: c.theirs.y + 36 });
              close();
            }}>另存为新便利贴</button>
            <button type="button" className="btn primary" onClick={() => {
              actions.patch(c.boardId, c.theirs, { text: c.mine, baseRev: c.theirs.rev });
              close();
            }}>用我的覆盖</button>
          </div>
        </>
      )}
    </Shell>
  );
}
