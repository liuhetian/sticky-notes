import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FAULTS, fileKind, isAlive, isSystemBoard } from '@/shared/constants';
import type { Item } from '@/shared/schema';
import { ApiError, api, authLost, serverNow, unwrap } from './api/client';
import { Login } from './features/auth/Login';
import { BoardView } from './features/board/Board';
import { RefreshButton } from './features/board/RefreshButton';
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
import { itemsQuery, useBoards } from './state/queries';
import { boardStore, faultsStore, jumpStore, meStore, spotlight } from './state/stores';
import { Logo } from './ui/Logo';

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [failed, setFailed] = useState('');
  const qc = useQueryClient();
  // 登录过、cookie 里有名字才算登录；名字记下来，本机先改界面时卡片角落先显示自己。
  // 只有 401 是没登录；别的失败（545、504、网络不通）留在这一屏，点一下重试
  const check = useCallback(() => {
    setFailed('');
    unwrap<{ name: string }>(api.me.$get()).then(({ name }) => { meStore.set(name); setAuthed(true); },
      (e) => (e instanceof ApiError && e.status === 401 ? setAuthed(false) : setFailed(e instanceof ApiError ? e.message : '连不上服务器')));
  }, []);
  useEffect(() => {
    check();
    const lost = () => { setAuthed(false); qc.clear(); };
    authLost.addEventListener('lost', lost);
    return () => authLost.removeEventListener('lost', lost);
  }, [qc, check]);
  if (failed) return <div className="splash-err"><div>{failed}</div><button type="button" className="btn" onClick={check}>重试</button></div>;
  if (authed === null) return <div className="splash"><Logo /></div>;
  if (!authed) return <Login onDone={(name) => { meStore.set(name); setAuthed(true); }} />;
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

  const showFaults = faultsStore.use();
  // 记着的是故障白板、设置里又关了显示，就回到第一块
  const current = boards?.find((b) => b.id === boardId && (b.id !== FAULTS || showFaults)) ?? boards?.find((b) => !isSystemBoard(b.id));

  // 跳到某块白板上的某个元素（分享链接、便利贴里的引用）：切过去，等那块白板的数据到了再高亮；只认这块白板，不去别处找
  const jump = jumpStore.use();
  useEffect(() => {
    if (!jump || !boards) return;
    jumpStore.set(null);
    const { boardId: to, itemId: id, dim } = jump;
    if (!boards.some((b) => b.id === to)) { toast.error('这块白板不存在了'); return; }
    boardStore.set(to);
    if (!id) return;
    const has = (list?: Item[]) => !!list?.some((x) => x.id === id && isAlive(x, serverNow()));
    // 本机已经有就直接高亮；没有再去服务端取一次确认（可能是别人刚放上去的）
    if (has(qc.getQueryData<Item[]>(itemsQuery(qc, to).queryKey))) { spotlight(id, dim); return; }
    qc.fetchQuery(itemsQuery(qc, to))
      .then((list) => (has(list) ? spotlight(id, dim) : toast.error('这个元素不存在了')))
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
  }, [jump, boards]);
  if (!boards || !current) return <div className="splash"><Logo /></div>;
  const renamable = !isSystemBoard(current.id);

  return (
    <div className="shell">
      <Sidebar boards={boards} current={current.id} onSwitch={boardStore.set} actions={actions}
        renaming={renaming} setRenaming={setRenaming}
        onLogout={async () => { await unwrap(api.logout.$post()).catch(() => {}); location.reload(); }} />
      <section className="main">
        <BoardView key={current.id} board={current} boards={boards} actions={actions} upload={upload} />
        {/* 没有顶栏：白板名字浮在画布左上角；关着自动同步时旁边有刷新按钮 */}
        <div className="title-float">
          <h1 className="board-title" title={renamable ? '双击改名' : undefined} onDoubleClick={() => renamable && setRenaming(current.id)}>{current.name}</h1>
          <RefreshButton boardId={current.id} />
        </div>
      </section>
      <Lightbox />
      <DocViewer />
      <ConflictDialog actions={actions} />
      <Guide boards={boards} />
    </div>
  );
}
