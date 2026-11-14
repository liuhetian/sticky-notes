import { strToU8, zipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import { formatChat, readChatZip } from '../src/server/services/chat';
import { newFileId } from '../src/shared/ids';
import { setup } from './helpers';

const TXT = '·小明\n2026年11月12日 18:23\n到了吗\n\n·小红\n2026年11月12日 18:23\n快了\n\n·小红\n2026年11月12日 18:23\n五分钟\n\n·小明\n2026年11月13日 09:01\n[图片] 微信图片_1.jpg\n';
const zip = (files: Record<string, string | Uint8Array>) =>
  zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? strToU8(v) : v])));

describe('聊天记录排版', () => {
  it('昵称加粗带时间，日期变了插一行，同一人同一分钟并在一起', () => {
    expect(formatChat(TXT)).toBe('*2026年11月12日*\n\n**小明** 18:23\n到了吗\n\n**小红** 18:23\n快了\n五分钟\n\n*2026年11月13日*\n\n**小明** 09:01\n[图片] 微信图片_1.jpg');
  });
  it('认不出格式就原样', () => {
    expect(formatChat('  随便一段话\n')).toBe('随便一段话');
  });
  it('压缩包：图片和文件都解出来，太大的留着计数；没有 txt 不算聊天记录', () => {
    const z = zip({ '聊天记录.txt': `${TXT}\n·小明\n2026年11月13日 09:02\n[文件] 微改.pdf\n`, 'x/微改.pdf': new Uint8Array([7]), 'x/微信图片_1.jpg': new Uint8Array([1, 2, 3]) });
    const r = readChatZip(z.slice().buffer)!;
    expect(r.parts).toEqual([{ name: '微信图片_1.jpg', data: new Uint8Array([1, 2, 3]) }, { name: '微改.pdf', data: new Uint8Array([7]) }]);
    expect(r.others).toBe(0);
    // 最多拆 30 个，多出来的留着计数
    const many = readChatZip(zip({ '聊天记录.txt': TXT, ...Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`x/图_${i}.jpg`, new Uint8Array([i])])) }).slice().buffer)!;
    expect(many.parts).toHaveLength(30);
    expect(many.others).toBe(1);
    expect(many.text).toMatch(/在连着的压缩包里）$/);
    expect(r.text).toMatch(/^\*2026年11月12日\*/);
    expect(readChatZip(zip({ 'a.jpg': new Uint8Array([1]) }).slice().buffer)).toBeNull();
    expect(readChatZip(strToU8('不是压缩包').slice().buffer)).toBeNull();
  });
});

describe('聊天记录压缩包进白板', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => { t = setup(); });

  it('iPhone 分享：只有文字的变成便利贴，压缩包删掉', async () => {
    const url = (await t.call('POST', '/share/file', { board: '共用', name: '聊天记录_20261112_203538', ext: 'zip' })).data;
    t.files.upload(url, zip({ '聊天记录.txt': TXT }));
    const items = await t.itemsOf(await t.firstBoard());
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: 'note', color: 'yellow' });
    expect(items[0].text).toContain('**小红** 18:23\n快了\n五分钟');
    expect(t.files.data.size).toBe(0);
  });

  it('iPhone 分享：整组（便利贴 + 图片）挑在内容中心附近的空地，不压着已有的卡片', async () => {
    const b = await t.firstBoard();
    const old = (await t.call('POST', `/boards/${b}/items`, { type: 'note', text: '原来就有', x: 1400, y: 900 })).data;
    const url = (await t.call('POST', '/share/file', { board: '共用', name: '聊天记录_20261113_101010', ext: 'zip' })).data;
    t.files.upload(url, zip({ '聊天记录.txt': TXT, 'x/微信图片_1.jpg': new Uint8Array([1]), 'x/微信图片_2.jpg': new Uint8Array([2]) }));
    const fresh = (await t.itemsOf(b)).filter((i) => i.id !== old.id);
    expect(fresh.map((i) => i.type).sort()).toEqual(['image', 'image', 'note']);
    const note = fresh.find((i) => i.type === 'note')!;
    for (const i of fresh) expect(i.x + (i.type === 'note' ? 240 : 280) <= old.x || i.x >= old.x + 240 || i.y >= old.y + 200 || i.y + 412 <= old.y).toBe(true);
    expect(fresh.filter((i) => i.type === 'image').map((i) => [i.x - note.x, i.y - note.y])).toEqual([[270, 0], [570, 0]]);
    expect(Math.hypot(note.x - old.x, note.y - old.y)).toBeLessThan(1200);
  });

  it('网页上传：图片拆成单独的卡片，连到它所在的那条消息上；只有图片的压缩包删掉', async () => {
    const id = newFileId();
    const z = zip({ '聊天记录.txt': TXT, '聊天记录内的图片、视频和文件/微信图片_1.jpg': new Uint8Array([1, 2, 3]) });
    t.files.upload(id, z);
    const b = await t.firstBoard();
    const r = await t.call('POST', `/boards/${b}/items`, { type: 'file', file: { id, name: '聊天记录_20261112_205844.zip', size: z.length, mime: '' }, x: 100, y: 120 });
    expect(r.status).toBe(201);
    expect(r.data).toMatchObject({ type: 'note', x: 100, y: 120 });
    const items = await t.itemsOf(b);
    expect(items.map((i) => i.type).sort()).toEqual(['image', 'note']);
    const img = items.find((i) => i.type === 'image');
    const note = items.find((i) => i.type === 'note');
    expect(img).toMatchObject({ x: 370, y: 120, file: { name: '微信图片_1.jpg', size: 3, mime: 'image/jpeg' } });
    expect(note.links).toMatchObject([{ to: img.id, a: { line: note.text.split('\n').length - 1, hint: '[图片] 微信图片_1.jpg' } }]);
    expect(t.files.data.has(img.file.id)).toBe(true);
    expect(t.files.data.has(id)).toBe(false);
  });

  it('pdf 这类文件也拆成文件卡片，连到它所在的那条消息上；都拆完了压缩包删掉', async () => {
    const url = (await t.call('POST', '/share/file', { board: '共用', name: '聊天记录_2', ext: 'zip' })).data;
    t.files.upload(url, zip({ '聊天记录.txt': '·小明\n2026年11月14日 10:15\n[文件] 微改.pdf\n', 'a/微改.pdf': new Uint8Array([1, 2]) }));
    const items = await t.itemsOf(await t.firstBoard());
    expect(items.map((i) => i.type).sort()).toEqual(['file', 'note']);
    const note = items.find((i) => i.type === 'note');
    const pdf = items.find((i) => i.type === 'file');
    expect(pdf).toMatchObject({ file: { name: '微改.pdf', size: 2, mime: '' } });
    expect(note.links).toMatchObject([{ to: pdf.id, a: { hint: '[文件] 微改.pdf' } }]);
    expect(note.text).not.toContain('压缩包');
    expect(t.files.data.size).toBe(1);
  });

  it('超出上限没拆的：压缩包留着，排在最后，连到末尾的说明上', async () => {
    const url = (await t.call('POST', '/share/file', { board: '共用', name: '聊天记录_1', ext: 'zip' })).data;
    t.files.upload(url, zip({ '聊天记录.txt': TXT, ...Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`a/图_${i}.jpg`, new Uint8Array([i])])) }));
    const items = await t.itemsOf(await t.firstBoard());
    const note = items.find((i) => i.type === 'note');
    const kept = items.find((i) => i.type === 'file');
    expect(kept).toMatchObject({ pending: false, file: { name: '聊天记录_1.zip' } });
    expect(note.links).toHaveLength(31);
    expect(note.links[30]).toMatchObject({ to: kept.id, a: { hint: '（还有 1 个文件没拆出来，在连着的压缩包里）' } });
  });

  it('名字对但不是聊天记录的压缩包，照样当文件', async () => {
    const url = (await t.call('POST', '/share/file', { board: '共用', name: '聊天记录备份', ext: 'zip' })).data;
    t.files.upload(url, zip({ 'a.jpg': new Uint8Array([1]) }));
    expect((await t.itemsOf(await t.firstBoard()))[0]).toMatchObject({ type: 'file', pending: false });
  });
});
