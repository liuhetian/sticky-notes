// 失败上报（docs/requirements.md「失败上报」）：页面攒下的接口失败，一次上报在故障白板上建一张便利贴。
// 故障白板满了就把最早的直接删掉，不进废纸篓。整块白板只读一遍：挑最早的、挑空位都用这一份，
// 换凭据 1 + 列名字 1 + 读 ≤50 + 删 ≤2 + 写 1，在一次执行约 62 个请求的额度里
import { BATCH, BOARD_MAX, FAULTS } from '../../shared/constants';
import { sizeOf } from '../../shared/layout';
import type { Fault, NoteItem } from '../../shared/schema';
import type { Ctx } from '../env';
import { CHANGES, newItemBase, purge } from './items';
import { autoPlace } from './place';

/** 北京时间「月-日 时:分:秒」 */
const stamp = (t: number) => new Date(t + 8 * 3600_000).toISOString().slice(5, 19).replace('T', ' ');

export const faultText = (faults: Fault[]) => [
  `接口失败 ${faults.length} 次`,
  ...faults.map((f) => `${stamp(f.at)} ${f.method} ${f.path} ${f.status || '网络不通'} ${f.ms} ms`),
].join('\n');

export async function reportFaults(ctx: Ctx, faults: Fault[]): Promise<NoteItem> {
  const index = await ctx.db.index(FAULTS);
  const items = await ctx.db.getItems(FAULTS, index.slice(0, BATCH).map((e) => e.id));
  const over = index.length + 1 - BOARD_MAX;
  const oldest = over > 0 ? [...items].sort((a, b) => a.createdAt - b.createdAt).slice(0, Math.min(over, CHANGES)) : [];
  await Promise.all(oldest.map((it) => purge(ctx, it)));
  const content = { type: 'note' as const, text: faultText(faults), color: 'pink' as const };
  const pos = autoPlace(items.filter((it) => !oldest.includes(it)), sizeOf(content));
  const item: NoteItem = { ...newItemBase(ctx, FAULTS, pos, null), ...content };
  await ctx.db.putItem(item);
  return item;
}
