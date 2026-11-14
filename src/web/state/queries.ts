// 读：每 5 秒先比 etag，只取变了的元素
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { BATCH, isAlive } from '@/shared/constants';
import type { Board, IndexEntry, Item, Reminder } from '@/shared/schema';
import { api, serverNow, syncClock, unwrap } from '../api/client';
import { isWriting, writeSeq } from './writes';

export const qk = {
  boards: ['boards'] as const,
  items: (boardId: string) => ['items', boardId] as const,
  reminders: ['reminders'] as const,
};

export function useBoards() {
  return useQuery({
    queryKey: qk.boards,
    queryFn: async () => (await unwrap<{ boards: Board[] }>(api.boards.$get())).boards,
    refetchInterval: 30_000,
  });
}

// 每块白板记一份「元素 id → etag」，轮询时只取 etag 变了的
// 手机快捷指令发来、还在传的元素每轮都重取，等它转成正常卡片
const isPending = (it?: Item) => !!it && (it.type === 'image' || it.type === 'file') && !!it.pending;
const etags = new Map<string, Map<string, string>>();

async function syncBoard(qc: QueryClient, boardId: string): Promise<Item[]> {
  const prev = qc.getQueryData<Item[]>(qk.items(boardId)) ?? [];
  const seq = writeSeq();
  if (isWriting()) return prev; // 本机正在写，这轮先不覆盖
  const idx = await unwrap<{ items: IndexEntry[]; now: number }>(api.boards[':id'].etags.$get({ param: { id: boardId } }));
  syncClock(idx.now);
  const known = etags.get(boardId) ?? new Map<string, string>();
  const prevById = new Map(prev.map((it) => [it.id, it]));
  const need = idx.items
    .filter((e) => known.get(e.id) !== e.etag || !prevById.has(e.id) || isPending(prevById.get(e.id)))
    .map((e) => e.id);
  const fetched = new Map<string, Item>();
  // 一批批取：后端一次读不了太多元素
  for (let i = 0; i < need.length; i += BATCH) {
    const part = await unwrap<{ items: Item[] }>(api.boards[':id'].items.$get({ param: { id: boardId }, query: { ids: need.slice(i, i + BATCH).join(',') } }));
    for (const it of part.items) fetched.set(it.id, it);
  }
  if (seq !== writeSeq() || isWriting()) return qc.getQueryData<Item[]>(qk.items(boardId)) ?? prev;
  const nextEtags = new Map<string, string>();
  const next: Item[] = [];
  for (const e of idx.items) {
    const it = need.includes(e.id) ? fetched.get(e.id) : prevById.get(e.id);
    if (!it) continue; // 到期了，服务端不返回
    next.push(it);
    nextEtags.set(e.id, e.etag);
  }
  etags.set(boardId, nextEtags);
  return next.sort((a, b) => a.createdAt - b.createdAt);
}

export function useItems(boardId: string | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.items(boardId ?? ''),
    queryFn: () => syncBoard(qc, boardId!),
    enabled: !!boardId,
    refetchInterval: 5000,
    select: (items) => items.filter((it) => isAlive(it, serverNow())),
  });
}

export function useReminderList() {
  return useQuery({
    queryKey: qk.reminders,
    queryFn: async () => {
      const r = await unwrap<{ reminders: Reminder[]; now: number }>(api.reminders.$get());
      syncClock(r.now);
      return r.reminders;
    },
    refetchInterval: 60_000,
  });
}
