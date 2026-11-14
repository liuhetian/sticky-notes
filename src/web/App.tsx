import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { TRASH, fileKind } from '@/shared/constants';
import type { Item } from '@/shared/schema';
import { api, authLost, unwrap } from './api/client';
import { Login } from './features/auth/Login';
import { BoardView } from './features/board/Board';
import { ConflictDialog } from './features/dialogs/ConflictDialog';
import { Guide } from './features/dialogs/Guide';
import { Lightbox } from './features/dialogs/Lightbox';
import { DocViewer } from './features/preview/DocViewer';
import { useReminders } from './features/reminders/useReminders';
import { useShareLink } from './features/share/useShareLink';
import { Sidebar } from './features/sidebar/Sidebar';
import { useUploader } from './features/upload/useUploader';
import { useDailyCleanup } from './state/cleanup';
import { useActions } from './state/actions';
import { qk, useBoards } from './state/queries';
import { boardStore, jumpStore, spotlight } from './state/stores';
import { Logo } from './ui/Logo';

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const qc = useQueryClient();
  useEffect(() => {
    unwrap(api.me.$get()).then(() => setAuthed(true), () => setAuthed(false));
    const lost = () => { setAuthed(false); qc.clear(); };
    authLost.addEventListener('lost', lost);
    return () => authLost.removeEventListener('lost', lost);
  }, [qc]);
  if (authed === null) return <div className="splash"><Logo /></div>;
  if (!authed) return <Login onDone={() => setAuthed(true)} />;
  return <Main />;
}

function Main() {
  const qc = useQueryClient();
  const { data: boards } = useBoards();
  const actions = useActions();
  const [renaming, setRenaming] = useState<string | null>(null);
  const boardId = boardStore.use();
  useShareLink(!!boards);

  const upload = useUploader(useCallback((bid, file, meta) =>
    actions.create(bid, { type: fileKind(file.name), file, x: meta.x, y: meta.y, ttl: meta.ttl }), [actions]));

  useDailyCleanup(!!boards);
  useReminders(boards ?? [], (r) => { boardStore.set(r.boardId); spotlight(r.itemId); }, actions.ackReminder);

  const current = boards?.find((b) => b.id === boardId) ?? boards?.find((b) => b.id !== TRASH);

  // 跳到某个元素（分享链接、便利贴里的引用）：就在眼前这块白板上直接高亮，否则先问服务端在哪块白板
  const jump = jumpStore.use();
  useEffect(() => {
    if (!jump) return;
    jumpStore.set(null);
    const { itemId: id, dim } = jump;
    if (current && current.id !== TRASH && qc.getQueryData<Item[]>(qk.items(current.id))?.some((x) => x.id === id)) { spotlight(id, dim); return; }
    unwrap<{ boardId: string }>(api.items[':id'].locate.$get({ param: { id } }))
      .then(({ boardId: found }) => { boardStore.set(found); spotlight(id, dim); })
      .catch(() => toast.error('这条已经过期或被删了'));
  }, [jump]);
  if (!boards || !current) return <div className="splash"><Logo /></div>;
  const inTrash = current.id === TRASH;

  return (
    <div className="shell">
      <Sidebar boards={boards} current={current.id} onSwitch={boardStore.set} actions={actions}
        renaming={renaming} setRenaming={setRenaming}
        onLogout={async () => { await unwrap(api.logout.$post()).catch(() => {}); location.reload(); }} />
      <section className="main">
        <BoardView key={current.id} board={current} boards={boards} actions={actions} upload={upload} />
        {/* 没有顶栏：白板名字浮在画布左上角 */}
        <div className="title-float">
          <h1 className="board-title" title={inTrash ? undefined : '双击改名'} onDoubleClick={() => !inTrash && setRenaming(current.id)}>{current.name}</h1>
        </div>
      </section>
      <Lightbox />
      <DocViewer />
      <ConflictDialog actions={actions} />
      <Guide boards={boards} />
    </div>
  );
}
