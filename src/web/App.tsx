import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TRASH } from '@/shared/constants';
import type { Item, Reminder } from '@/shared/schema';
import { api, authLost, unwrap } from './api/client';
import { Login } from './features/auth/Login';
import { BoardView, type BoardApi } from './features/board/Board';
import { PlusMenu } from './features/board/CreateMenu';
import { ConflictDialog } from './features/dialogs/ConflictDialog';
import { Guide } from './features/dialogs/Guide';
import { Lightbox } from './features/dialogs/Lightbox';
import { DocViewer } from './features/preview/DocViewer';
import { useReminders } from './features/reminders/useReminders';
import { useShareLink } from './features/share/useShareLink';
import { Sidebar } from './features/sidebar/Sidebar';
import { kindForUpload, useUploader } from './features/upload/useUploader';
import { useMobile } from './lib/hooks';
import { useDailyCleanup } from './state/cleanup';
import { useActions } from './state/actions';
import { qk, useBoards, useItems } from './state/queries';
import { spotlight } from './state/stores';
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
  const mobile = useMobile();
  const boardApi = useRef<BoardApi>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  // 当前在哪块白板只记在本机，不进地址栏
  const [boardId, setBoardId] = useState<string | null>(() => localStorage.getItem('clip.board'));

  const switchBoard = useCallback((id: string) => {
    setBoardId(id);
    localStorage.setItem('clip.board', id);
  }, []);
  useShareLink(!!boards, switchBoard);

  const upload = useUploader(useCallback((bid, file, meta) =>
    actions.create(bid, { type: kindForUpload(file.name, file.mime), file, x: meta.x, y: meta.y, ttl: meta.ttl }), [actions]));

  const markDone = async (r: Reminder) => {
    const it = qc.getQueryData<Item[]>(qk.items(r.boardId))?.find((x) => x.id === r.itemId);
    if (it) await actions.patch(r.boardId, it, { remindDone: true });
    else {
      await unwrap(api.boards[':id'].items[':itemId'].$patch({ param: { id: r.boardId, itemId: r.itemId }, json: { remindDone: true } })).catch(() => {});
      qc.invalidateQueries({ queryKey: qk.reminders });
    }
  };
  useDailyCleanup(!!boards);
  useReminders(boards ?? [], (r) => { switchBoard(r.boardId); spotlight(r.itemId); }, markDone);

  const current = boards?.find((b) => b.id === boardId) ?? boards?.find((b) => b.id !== TRASH);
  const { data: items, isError } = useItems(current?.id);
  if (!boards || !current) return <div className="splash"><Logo /></div>;
  const inTrash = current.id === TRASH;

  return (
    <div className="shell">
      <Sidebar boards={boards} current={current.id} onSwitch={switchBoard} actions={actions}
        renaming={renaming} setRenaming={setRenaming}
        onLogout={async () => { await unwrap(api.logout.$post()).catch(() => {}); location.reload(); }} />
      <section className="main">
        <BoardView key={current.id} board={current} boards={boards} actions={actions} upload={upload} apiRef={boardApi} />
        {/* 没有顶栏：白板名字浮在画布左上角 */}
        <div className="title-float">
          <h1 className="board-title" title={inTrash ? undefined : '双击改名'} onDoubleClick={() => !inTrash && setRenaming(current.id)}>{current.name}</h1>
          {!!items?.length && <span className="count">{items.length} 项</span>}
          <span className={isError ? 'sync err' : 'sync ok'} title={isError ? '同步失败' : '已同步'} />
        </div>
        {/* 电脑上「+」和「清空废纸篓」在底部操作栏的最后；手机没有操作栏，清空放右上角 */}
        {mobile && inTrash && (
          <div className="corner-float">
            <button type="button" className="btn danger" onClick={() => {
              if (!items?.length) return;
              if (confirm(`彻底删除废纸篓里的 ${items.length} 项？删了就找不回来了`)) actions.clearTrash();
            }}>清空废纸篓</button>
          </div>
        )}
      </section>
      {mobile && !inTrash && (
        <PlusMenu className="fab" side="top" onNote={() => boardApi.current?.startDraft()} onSketch={() => boardApi.current?.startSketch()}
          onFile={() => boardApi.current?.pickFiles()} onLocation={() => boardApi.current?.startLocation()} />
      )}
      <Lightbox />
      <DocViewer />
      <ConflictDialog actions={actions} />
      <Guide boards={boards} />
    </div>
  );
}
