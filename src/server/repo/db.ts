// 元素数据放在 EdgeOne Blob，对象布局：
//   boards.json                               白板列表（很少改，整个文档存）
//   items/<boardId>/<itemId>.json             每个元素一个对象，改不同元素的人互不覆盖
//   reminders/<remindAt>-<boardId>-<itemId>   提醒索引，内容全在 key 里，list 一次就够
// 这一层只管读写，不懂业务（废纸篓、到期、文件都在 services 里）。读一律强一致：在 edge.ts 建 store 时设好
import { FAULTS, TRASH } from '../../shared/constants';
import { newBoardId } from '../../shared/ids';
import type { Board, IndexEntry, Item, Reminder } from '../../shared/schema';
import type { BlobLike } from '../storage/blob';

const SEED = ['共用', '牛牛', '香蕉'];
const itemKey = (boardId: string, id: string) => `items/${boardId}/${id}.json`;
const reminderKey = (r: Reminder) => `reminders/${String(r.remindAt).padStart(13, '0')}-${r.boardId}-${r.itemId}`;
/** 废纸篓里的不提醒 */
const reminderOf = (it: Item | null) =>
  it && it.boardId !== TRASH && it.remindAt !== null && !it.remindDone ? reminderKey({ itemId: it.id, boardId: it.boardId, remindAt: it.remindAt }) : null;

export class Db {
  constructor(private blob: BlobLike) {}

  // ── 白板 ──
  async boards(): Promise<Board[]> {
    const doc: { boards: Board[] } | null = await this.blob.get('boards.json', { type: 'json' });
    // 故障白板是后加的：已有的白板列表里没有就补上，只补这一次
    if (doc?.boards.some((b) => b.id === FAULTS)) return doc.boards;
    const now = Date.now();
    const boards: Board[] = doc?.boards ?? [
      ...SEED.map((name, i) => ({ id: newBoardId(), name, createdAt: now + i })),
      { id: TRASH, name: '废纸篓', createdAt: now },
    ];
    return this.saveBoards([...boards, { id: FAULTS, name: '故障', createdAt: now }]);
  }

  /** 普通白板在前，故障白板、废纸篓排最后；返回排好的 */
  async saveBoards(boards: Board[]): Promise<Board[]> {
    const last = [FAULTS, TRASH];
    const sorted = [...boards.filter((b) => !last.includes(b.id)), ...last.flatMap((id) => boards.filter((b) => b.id === id))];
    await this.blob.setJSON('boards.json', { boards: sorted });
    return sorted;
  }

  /** 按 id 找，找不到再按名字找（快捷指令和 AI 写的是名字） */
  async findBoard(idOrName: string): Promise<Board | undefined> {
    const boards = await this.boards();
    return boards.find((b) => b.id === idOrName) ?? boards.find((b) => b.name === idOrName);
  }

  // ── 元素 ──
  async index(boardId: string): Promise<IndexEntry[]> {
    const prefix = `items/${boardId}/`;
    const { blobs } = await this.blob.list({ prefix });
    return blobs.map((b) => ({ id: b.key.slice(prefix.length, -'.json'.length), etag: b.etag }));
  }

  getItem(boardId: string, id: string): Promise<Item | null> {
    return this.blob.get(itemKey(boardId, id), { type: 'json' });
  }

  /**
   * 一次读这几个（最多 BATCH 个，调用方管）。新建的 store 还没凭据时并发读，每个读都会各自去换一次凭据，
   * 一个元素就算两个请求：所以先单独读第一个把凭据取好，再并发读其余的
   */
  async getItems(boardId: string, ids: string[]): Promise<Item[]> {
    if (!ids.length) return [];
    const first = await this.getItem(boardId, ids[0]);
    const rest = await Promise.all(ids.slice(1).map((id) => this.getItem(boardId, id)));
    return [first, ...rest].filter((x): x is Item => !!x);
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

  /** 全站所有元素在哪（只列名字，一次请求），按元素 id 排好：清理任务按这个顺序一批批过 */
  async everything(): Promise<{ boardId: string; id: string }[]> {
    const { blobs } = await this.blob.list({ prefix: 'items/' });
    return blobs.flatMap((b) => {
      const m = b.key.match(/^items\/([^/]+)\/([^/]+)\.json$/);
      return m ? [{ boardId: m[1], id: m[2] }] : [];
    }).sort((a, b) => a.id.localeCompare(b.id));
  }

  // ── 清理任务跨批次要记的东西 ──
  scratch<T>(): Promise<T | null> { return this.blob.get('cleanup/state.json', { type: 'json' }); }
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
    const { blobs } = await this.blob.list({ prefix: 'reminders/' });
    return blobs.flatMap((b) => {
      const m = b.key.match(/^reminders\/(\d{13})-([0-9a-z]+)-([0-9a-f]{16})$/);
      return m ? [{ remindAt: Number(m[1]), boardId: m[2], itemId: m[3] }] : [];
    });
  }

  dropReminder(r: Reminder) {
    return this.blob.delete(reminderKey(r));
  }
}
