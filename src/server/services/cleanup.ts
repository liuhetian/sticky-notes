// 每天一次的清理：到期的进废纸篓、废纸篓里满 30 天的真删、超出 50 个的真删、传了一半的、没人引用的文件。
// 一次执行读不了太多元素，所以分批：每调一次只做一小段，进度和中间结果记在存储里，下次调用接着干。三个阶段依次是：
//   过元素（每次 READS 个）→ 修剪废纸篓（每次删几个，直到不超）→ 收尾删没人引用的文件
// 谁来一次次调：每天的定时任务推一批，页面打开时接着调到做完（边缘函数自己请求自己的域名会被平台回 404，没法自己接力）
import { DAY, TRASH, isAlive } from '../../shared/constants';
import { fileIdTime } from '../../shared/ids';
import { isFileLike } from '../../shared/items';
import type { Ctx } from '../env';
import { CHANGES, expire, fileIdsOf, pruneTrash, purge } from './items';

/** 一批最多读几个元素；收尾时一次最多删几个文件 */
const READS = 15, SWEEP = 20;

export type CleanupStats = { expired: number; stalePending: number; trashPruned: number; orphanFiles: number };
/**
 * after 是上一批看到的最后一个元素的 id，下一批从比它大的接着看：记 id 不记位置，两批之间别处删了、加了都不会错位。
 * startedAt 是这一轮开始的时间：这一轮中途新建的元素可能没被看到，收尾时不碰它们的文件
 */
type Scratch = { after: string; startedAt: number; stats: CleanupStats; referenced: string[] };
const fresh = (now: number): Scratch => ({ after: '', startedAt: now, stats: { expired: 0, stalePending: 0, trashPruned: 0, orphanFiles: 0 }, referenced: [] });

/** 接着上次的进度清一批。返回这一轮累计的结果；done 是这一轮全部做完了（下次调用开始新的一轮） */
export async function cleanup(ctx: Ctx, now = Date.now()): Promise<CleanupStats & { done: boolean }> {
  const { db, files } = ctx;
  const all = await db.everything();
  const s = (await db.scratch<Scratch>()) ?? fresh(now);
  const at = all.findIndex((e) => e.id > s.after);

  // 收尾要靠前面各批攒下的「哪些文件还有人用」，所以一轮里至少先过一批（一个元素都没有时除外）
  if (at >= 0) {
    let i = at, changes = 0;
    for (; i < all.length && i - at < READS && changes < CHANGES; i++) {
      const it = await db.getItem(all[i].boardId, all[i].id);
      if (!it) continue;
      // 快捷指令建了「上传中」的卡片，文件却一天都没传上来
      const stale = isFileLike(it) && it.pending && now - it.createdAt > DAY && (await files.size(it.file.id)) === null;
      if (stale) { await purge(ctx, it); s.stats.stalePending++; changes++; continue; }
      if (!isAlive(it, now)) {
        await expire(ctx, it);
        s.stats.expired++;
        changes++;
        if (it.boardId === TRASH) continue;
      }
      s.referenced.push(...fileIdsOf(it));
    }
    s.after = all[i - 1].id;
    await db.saveScratch(s);
    return { ...s.stats, done: false };
  }

  // 废纸篓超出 50 个的，把最早进去的真删。读废纸篓就要一整批请求，和收尾分开在不同的调用里做
  const pruned = await pruneTrash(ctx);
  if (pruned.removed) {
    s.stats.trashPruned += pruned.removed;
    await db.saveScratch(s);
    return { ...s.stats, done: false };
  }

  // 收尾：领了上传地址却没建成元素的文件（留一天余量，正在传的不会被误删）。删不完的明天接着删。
  // 被修剪掉的元素，文件已经跟着删了，名单里多记着也无害
  const referenced = new Set(s.referenced);
  const orphans = (await files.list()).filter((f) => !referenced.has(f.id) && s.startedAt - (fileIdTime(f.id) ?? f.modifiedAt) > DAY).slice(0, SWEEP);
  await Promise.all(orphans.map((f) => files.delete(f.id)));
  s.stats.orphanFiles += orphans.length;
  await db.dropScratch();
  return { ...s.stats, done: true };
}
