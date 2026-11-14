// 每天一次的清理：到期的进废纸篓、废纸篓里满 30 天的真删、传了一半的、没人引用的文件、对不上的提醒。
// 一次执行读不了太多元素，所以分批：每调一次只看一小段，进度和中间结果记在存储里，下次调用接着干；全部看完后单独一步做收尾。
// 谁来一次次调：每天的定时任务推一批，页面打开时接着调到做完（边缘函数自己请求自己的域名会被平台回 404，没法自己接力）
import { DAY, TRASH, isAlive } from '../../shared/constants';
import { fileIdTime } from '../../shared/ids';
import type { Ctx } from '../env';
import { expire, fileIdsOf, purge } from './items';

/** 一批最多读几个元素、最多改几个（改一个要好几次请求）；收尾时一次最多删几个 */
const READS = 15, CHANGES = 2, SWEEP = 20;

export type CleanupStats = { expired: number; stalePending: number; orphanFiles: number; staleReminders: number };
/** at 是下一批从第几个元素开始 */
type Scratch = { at: number; stats: CleanupStats; referenced: string[]; live: string[] };
const fresh = (): Scratch => ({ at: 0, stats: { expired: 0, stalePending: 0, orphanFiles: 0, staleReminders: 0 }, referenced: [], live: [] });

/** 接着上次的进度清一批。返回这一轮累计的结果；done 是这一轮全部做完了（下次调用开始新的一轮） */
export async function cleanup(ctx: Ctx, now = Date.now()): Promise<CleanupStats & { done: boolean }> {
  const { db, files } = ctx;
  const all = await db.everything();
  const s = (await db.scratch<Scratch>()) ?? fresh();
  const at = s.at;

  // 收尾要靠前面各批攒下的「哪些文件还有人用」，所以一轮里至少先过一批（一个元素都没有时除外）
  if (at < all.length) {
    let i = at, changes = 0, gone = 0;
    for (; i < all.length && i - at < READS && changes < CHANGES; i++) {
      const it = await db.getItem(all[i].boardId, all[i].id);
      if (!it) continue;
      // 快捷指令建了「上传中」的卡片，文件却一天都没传上来
      const stale = (it.type === 'image' || it.type === 'file') && it.pending && now - it.createdAt > DAY && (await files.size(it.file.id)) === null;
      if (stale) { await purge(ctx, it); s.stats.stalePending++; changes++; gone++; continue; }
      if (!isAlive(it, now)) {
        await expire(ctx, it);
        s.stats.expired++;
        changes++;
        if (it.boardId === TRASH) { gone++; continue; }
      } else if (it.boardId !== TRASH) s.live.push(it.id);
      s.referenced.push(...fileIdsOf(it));
    }
    // 真删掉的不在名单里了，后面的往前挪了几位
    s.at = i - gone;
    await db.saveScratch(s);
    return { ...s.stats, done: false };
  }

  // 收尾：领了上传地址却没建成元素的文件（留一天余量，正在传的不会被误删）；指向的元素已经不在白板上的提醒。删不完的明天接着删
  const referenced = new Set(s.referenced), live = new Set(s.live);
  const orphans = (await files.list()).filter((f) => !referenced.has(f.id) && now - (fileIdTime(f.id) ?? f.modifiedAt) > DAY).slice(0, SWEEP);
  await Promise.all(orphans.map((f) => files.delete(f.id)));
  s.stats.orphanFiles += orphans.length;
  const stale = (await db.reminders()).filter((r) => !live.has(r.itemId)).slice(0, SWEEP);
  await Promise.all(stale.map((r) => db.dropReminder(r)));
  s.stats.staleReminders += stale.length;
  await db.dropScratch();
  return { ...s.stats, done: true };
}
