// 元素数据放在 EdgeOne Blob，对象布局：
//   boards.json                               白板列表（很少改，整个文档存）
//   items/<boardId>/<itemId>.json             每个元素一个对象，改不同元素的人互不覆盖
//   reminders/<remindAt>-<boardId>-<itemId>   提醒索引，内容全在 key 里，list 一次就够
// 这一层只管读写，不懂业务（废纸篓、到期、文件都在 services 里）
import { TRASH } from '../../shared/constants';
import { newBoardId } from '../../shared/ids';
import type { Board, IndexEntry, Item, Reminder } from '../../shared/schema';
import type { BlobLike } from '../storage/blob';

const SEED = ['共用', '牛牛', '香蕉'];
const S = { consistency: 'strong' } as const;
const itemKey = (boardId: string, id: string) => `items/${boardId}/${id}.json`;
const reminderKey = (r: Reminder) => `reminders/${String(r.remindAt).padStart(13, '0')}-${r.boardId}-${r.itemId}`;
/** 废纸篓里的不提醒 */
const reminderOf = (it: Item | null) =>
  it && it.boardId !== TRASH && it.remindAt !== null && !it.remindDone ? reminderKey({ itemId: it.id, boardId: it.boardId, remindAt: it.remindAt }) : null;

export class Db {
  constructor(private blob: BlobLike) {}

  // ── 白板 ──
  async boards(): Promise<Board[]> {
    const doc: { boards: Board[] } | null = await this.blob.get('boards.json', { type: 'json', ...S });
    if (doc) return doc.boards;
    const now = Date.now();
    const boards: Board[] = [
      ...SEED.map((name, i) => ({ id: newBoardId(), name, createdAt: now + i })),
      { id: TRASH, name: '废纸篓', trash: true, createdAt: now },
    ];
    await this.saveBoards(boards);
    return boards;
  }

  /** 废纸篓永远排最后 */
  async saveBoards(boards: Board[]) {
    const sorted = [...boards.filter((b) => b.id !== TRASH), ...boards.filter((b) => b.id === TRASH)];
    await this.blob.setJSON('boards.json', { boards: sorted });
  }

  /** 按 id 找，找不到再按名字找（快捷指令里写的是名字） */
  async findBoard(idOrName: string): Promise<Board | undefined> {
    const boards = await this.boards();
    return boards.find((b) => b.id === idOrName) ?? boards.find((b) => b.name === idOrName && b.id !== TRASH);
  }

  // ── 元素 ──
  async index(boardId: string): Promise<IndexEntry[]> {
    const prefix = `items/${boardId}/`;
    const { blobs } = await this.blob.list({ prefix, ...S });
    return blobs.map((b) => ({ id: b.key.slice(prefix.length, -'.json'.length), etag: b.etag }));
  }

  getItem(boardId: string, id: string): Promise<Item | null> {
    return this.blob.get(itemKey(boardId, id), { type: 'json', ...S });
  }

  async getItems(boardId: string, ids?: string[]): Promise<Item[]> {
    const wanted = ids ?? (await this.index(boardId)).map((e) => e.id);
    return (await Promise.all(wanted.map((id) => this.getItem(boardId, id)))).filter((x): x is Item => !!x);
  }

  /** prev 是这个元素写之前的样子（没有就是新建），用来同步提醒索引 */
  async putItem(it: Item, prev: Item | null = null) {
    await this.blob.setJSON(itemKey(it.boardId, it.id), it);
    await this.syncReminder(prev, it);
  }

  async dropItem(it: Item) {
    await this.blob.delete(itemKey(it.boardId, it.id));
    await this.syncReminder(it, null);
  }

  /** 换白板：先写新位置再删旧位置，中途失败最多短暂多一份 */
  async relocate(prev: Item, next: Item) {
    await this.putItem(next, prev);
    if (next.boardId !== prev.boardId) await this.blob.delete(itemKey(prev.boardId, prev.id));
  }

  /** 分享链接只带元素 id：list 一次 items/，找到它在哪块白板 */
  async locate(id: string): Promise<string | null> {
    const { blobs } = await this.blob.list({ prefix: 'items/', ...S });
    const hit = blobs.find((b) => b.key.endsWith(`/${id}.json`));
    return hit ? hit.key.split('/')[1] : null;
  }

  /** 全站所有元素在哪（只列名字，一次请求），按元素 id 排好：清理任务按这个顺序一批批过 */
  async everything(): Promise<{ boardId: string; id: string }[]> {
    const { blobs } = await this.blob.list({ prefix: 'items/', ...S });
    return blobs.flatMap((b) => {
      const m = b.key.match(/^items\/([^/]+)\/([0-9a-f]{16})\.json$/);
      return m ? [{ boardId: m[1], id: m[2] }] : [];
    }).sort((a, b) => a.id.localeCompare(b.id));
  }

  // ── 清理任务跨批次要记的东西 ──
  scratch<T>(): Promise<T | null> { return this.blob.get('cleanup/state.json', { type: 'json', ...S }); }
  saveScratch(v: unknown) { return this.blob.setJSON('cleanup/state.json', v); }
  dropScratch() { return this.blob.delete('cleanup/state.json'); }

  // ── 提醒索引 ──
  private async syncReminder(prev: Item | null, next: Item | null) {
    const a = reminderOf(prev), b = reminderOf(next);
    if (a === b) return;
    if (a) await this.blob.delete(a);
    if (b) await this.blob.setJSON(b, 1);
  }

  async reminders(): Promise<Reminder[]> {
    const { blobs } = await this.blob.list({ prefix: 'reminders/', ...S });
    return blobs.flatMap((b) => {
      const m = b.key.match(/^reminders\/(\d{13})-([0-9a-z]+)-([0-9a-f]{16})$/);
      return m ? [{ remindAt: Number(m[1]), boardId: m[2], itemId: m[3] }] : [];
    });
  }

  dropReminder(r: Reminder) {
    return this.blob.delete(reminderKey(r));
  }
}
