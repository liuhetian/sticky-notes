import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BATCH, DAY, MAX_FILE, TRASH_KEEP } from '../src/shared/constants';
import { newFileId, newId } from '../src/shared/ids';
import { ENV, note, setup } from './helpers';

let t: ReturnType<typeof setup>;
beforeEach(() => { t = setup(); });

describe('鉴权', () => {
  it('不带凭证 401，密码错 401', async () => {
    expect((await t.call('GET', '/boards', undefined, {})).status).toBe(401);
    expect((await t.call('GET', '/boards', undefined, { 'X-Password': 'nope' })).status).toBe(401);
  });
  it('登录发 cookie，带 cookie 能访问；改了密码旧 cookie 失效', async () => {
    expect((await t.call('POST', '/login', { password: 'bad' }, {})).status).toBe(401);
    const ok = await t.call('POST', '/login', { password: 'pw-test' }, {});
    const cookie = ok.res.headers.get('set-cookie')!;
    expect(cookie).toMatch(/clip_auth=.*HttpOnly/);
    const headers = { Cookie: cookie.split(';')[0] };
    expect((await t.call('GET', '/me', undefined, headers)).status).toBe(200);
    expect((await t.call('GET', '/me', undefined, headers, { ...ENV, SITE_PASSWORD: 'changed' })).status).toBe(401);
  });
});

describe('白板', () => {
  it('第一次读：共用、牛牛、香蕉 + 最后的废纸篓', async () => {
    const { data } = await t.call('GET', '/boards');
    expect(data.boards.map((b: any) => b.name)).toEqual(['共用', '牛牛', '香蕉', '废纸篓']);
    expect(data.boards.at(-1).id).toBe('trash');
  });
  it('新建插在废纸篓前；废纸篓不能改名不能删', async () => {
    await t.call('POST', '/boards', { name: '新的' });
    const names = (await t.call('GET', '/boards')).data.boards.map((b: any) => b.name);
    expect(names.slice(-2)).toEqual(['新的', '废纸篓']);
    expect((await t.call('PATCH', '/boards/trash', { name: 'x' })).status).toBe(400);
    expect((await t.call('DELETE', '/boards/trash')).status).toBe(400);
  });
  it('删白板：上面的元素进废纸篓；原白板没了，放回时去第一块', async () => {
    const [first, second] = await t.boardIds();
    const it = (await t.call('POST', `/boards/${second}/items`, note())).data;
    expect((await t.call('DELETE', `/boards/${second}`)).data).toMatchObject({ ok: true, trashed: 1 });
    expect(await t.boardIds()).not.toContain(second);
    expect(await t.itemsOf('trash')).toMatchObject([{ id: it.id, from: second }]);
    expect((await t.call('POST', `/boards/trash/items/${it.id}/move`, {})).data.to).toBe(first);
  });
});

describe('元素', () => {
  it('建便利贴、etags 拿 etag、按 ids 取', async () => {
    const b = await t.firstBoard();
    const { data: it, status } = await t.call('POST', `/boards/${b}/items`, note());
    expect(status).toBe(201);
    expect(it).toMatchObject({ type: 'note', color: 'yellow', rev: 1, boardId: b });
    const idx = (await t.call('GET', `/boards/${b}/etags`)).data.items;
    expect(idx).toMatchObject([{ id: it.id }]);
    expect(idx[0].etag).toBeTruthy();
    expect((await t.call('GET', `/boards/${b}/items?ids=${it.id}`)).data.items[0].text).toBe('你好');
  });
  it('id 由前端定；同一个 id 重发不会建两个', async () => {
    const b = await t.firstBoard();
    const id = newId();
    expect((await t.call('POST', `/boards/${b}/items`, note({ id }))).data.id).toBe(id);
    const again = await t.call('POST', `/boards/${b}/items`, note({ id, text: '重发' }));
    expect(again.status).toBe(200);
    expect(again.data.text).toBe('你好');
    expect(await t.itemsOf(b)).toHaveLength(1);
    expect((await t.call('POST', `/boards/${b}/items`, note({ id: '不合法' }))).status).toBe(400);
  });
  it('参数不对回 400', async () => {
    const b = await t.firstBoard();
    const r = await t.call('POST', `/boards/${b}/items`, { type: 'note', text: 'x', x: -5, y: 1 });
    expect(r.status).toBe(400);
    expect(r.data.error).toContain('参数不对');
  });
  it('按字段合并：一个改位置、一个改颜色，两边都保留', async () => {
    const b = await t.firstBoard();
    const it = (await t.call('POST', `/boards/${b}/items`, note())).data;
    await t.call('PATCH', `/boards/${b}/items/${it.id}`, { x: 300, y: 320 });
    const r = (await t.call('PATCH', `/boards/${b}/items/${it.id}`, { color: 'blue' })).data;
    expect(r).toMatchObject({ x: 300, y: 320, color: 'blue', rev: 3 });
  });
  it('文字带过期的 baseRev 回 409，附上最新内容', async () => {
    const b = await t.firstBoard();
    const it = (await t.call('POST', `/boards/${b}/items`, note())).data;
    await t.call('PATCH', `/boards/${b}/items/${it.id}`, { text: '别人改的', baseRev: 1 });
    const r = await t.call('PATCH', `/boards/${b}/items/${it.id}`, { text: '我改的', baseRev: 1 });
    expect(r.status).toBe(409);
    expect(r.data.item.text).toBe('别人改的');
    expect((await t.call('PATCH', `/boards/${b}/items/${it.id}`, { text: '我改的', baseRev: 2 })).status).toBe(200);
  });
  it('连线：带锚点存下来，按 id 去重，去掉连自己的；锚点只认图片上的点', async () => {
    const b = await t.firstBoard();
    const a = (await t.call('POST', `/boards/${b}/items`, note({ text: '一\n二' }))).data;
    const other = newId();
    const links = [
      { id: 'aaaaaaaa', to: other, a: { px: 1, py: 0 }, b: { px: 0.25, py: 0.5 } },
      { id: 'aaaaaaaa', to: other },
      { id: 'bbbbbbbb', to: a.id },
      { id: 'cccccccc', to: other },
    ];
    const r = await t.call('PATCH', `/boards/${b}/items/${a.id}`, { links });
    expect(r.data.links).toEqual([links[0], links[3]]);
    expect((await t.call('PATCH', `/boards/${b}/items/${a.id}`, { links: [{ id: 'x', to: other }] })).status).toBe(400);
    expect((await t.call('PATCH', `/boards/${b}/items/${a.id}`, { links: [{ id: 'dddddddd', to: other, a: { line: 1, hint: '二' } }] })).status).toBe(400);
  });
  it('分享链接：locate 找到所在白板；进了废纸篓就算没了', async () => {
    const b = await t.firstBoard();
    const it = (await t.call('POST', `/boards/${b}/items`, note())).data;
    expect((await t.call('GET', `/items/${it.id}/locate`)).data.boardId).toBe(b);
    await t.call('DELETE', `/boards/${b}/items/${it.id}`);
    expect((await t.call('GET', `/items/${it.id}/locate`)).status).toBe(404);
    expect((await t.call('GET', '/items/0000000000000000/locate')).status).toBe(404);
  });
});

describe('废纸篓', () => {
  it('删除是进废纸篓：记下来源，从这一刻起留 30 天', async () => {
    const b = await t.firstBoard();
    const it = (await t.call('POST', `/boards/${b}/items`, note({ ttl: 600 }))).data;
    const r = (await t.call('DELETE', `/boards/${b}/items/${it.id}`)).data;
    expect(r.item).toMatchObject({ id: it.id, boardId: 'trash', from: b });
    expect(Math.abs(r.item.expiresAt - (Date.now() + TRASH_KEEP))).toBeLessThan(5000);
    expect(await t.itemsOf(b)).toHaveLength(0);
    expect(await t.itemsOf('trash')).toHaveLength(1);
  });
  it('放回原处：默认按 7 天重新计时；也可以指定保留时长或原来的到期时间', async () => {
    const b = await t.firstBoard();
    const mk = async () => (await t.call('POST', `/boards/${b}/items`, note({ ttl: 600 }))).data;
    const back = async (id: string, body: unknown) => {
      await t.call('DELETE', `/boards/${b}/items/${id}`);
      return (await t.call('POST', `/boards/trash/items/${id}/move`, body)).data;
    };
    const one = await back((await mk()).id, {});
    expect(one.to).toBe(b);
    expect(one.item.from).toBeUndefined();
    expect(Math.abs(one.item.expiresAt - (Date.now() + 7 * DAY))).toBeLessThan(5000);
    expect((await back((await mk()).id, { ttl: null })).item.expiresAt).toBeNull();
    const it = await mk();
    expect((await back(it.id, { expiresAt: it.expiresAt })).item.expiresAt).toBe(it.expiresAt);
  });
  it('到期的进废纸篓，不直接消失；废纸篓里到期的才真删', async () => {
    const b = await t.firstBoard();
    const it = (await t.call('POST', `/boards/${b}/items`, note())).data;
    const key = `items/${b}/${it.id}.json`;
    await t.blob.setJSON(key, { ...it, expiresAt: Date.now() - 1000 });
    expect(await t.itemsOf(b)).toHaveLength(0);
    const trashed = await t.itemsOf('trash');
    expect(trashed).toMatchObject([{ id: it.id, from: b }]);
    await t.blob.setJSON(`items/trash/${it.id}.json`, { ...trashed[0], expiresAt: Date.now() - 1000 });
    expect(await t.itemsOf('trash')).toHaveLength(0);
    expect([...t.blob.data.keys()].filter((k) => k.startsWith('items/'))).toEqual([]);
  });
  it('废纸篓不能直接贴；里面的删除是真删，连文件一起；可以一键清空', async () => {
    const b = await t.firstBoard();
    expect((await t.call('POST', '/boards/trash/items', note())).status).toBe(400);
    const fid = newFileId();
    t.files.upload(fid, 'png');
    const img = (await t.call('POST', `/boards/${b}/items`, { type: 'image', file: { id: fid, name: 'a.png', size: 3, mime: 'image/png' }, x: 1, y: 1 })).data;
    await t.call('DELETE', `/boards/${b}/items/${img.id}`);
    expect(t.files.data.has(fid)).toBe(true); // 进废纸篓，文件还在
    await t.call('DELETE', `/boards/trash/items/${img.id}`);
    expect(t.files.data.has(fid)).toBe(false);
    const n = (await t.call('POST', `/boards/${b}/items`, note())).data;
    await t.call('DELETE', `/boards/${b}/items/${n.id}`);
    expect((await t.call('DELETE', `/boards/${b}/items`)).status).toBe(400);
    expect((await t.call('DELETE', '/boards/trash/items')).data.removed).toBe(1);
    expect(await t.itemsOf('trash')).toHaveLength(0);
  });
});

describe('文件', () => {
  it('领地址、上传、建图片元素；图片 inline 跳到 COS，其他当附件；raw=1 由本站转发', async () => {
    const b = await t.firstBoard();
    const up = (await t.call('POST', '/uploads', { size: 3 })).data;
    const file = { id: up.id, name: 'a.png', size: 3, mime: 'image/png' };
    expect((await t.call('POST', `/boards/${b}/items`, { type: 'image', file, x: 1, y: 1 })).status).toBe(400); // 还没传
    t.files.upload(up.url, 'PNG');
    expect((await t.call('POST', `/boards/${b}/items`, { type: 'image', file, x: 1, y: 1 })).status).toBe(201);
    const inline = await t.call('GET', `/files/${up.id}/a.png`);
    expect(inline.status).toBe(302);
    expect(inline.res.headers.get('location')).toContain('inline=true&mime=image%2Fpng');
    expect((await t.call('GET', `/files/${up.id}/a.png?dl=1`)).res.headers.get('location')).toContain('inline=false');
    expect((await t.call('GET', `/files/${up.id}/a.html`)).res.headers.get('location')).toContain('inline=false&mime=application%2Foctet-stream');
    // 音视频和 PDF 按本来的类型给，页面里才能直接播放、预览；要下载时仍当附件
    expect((await t.call('GET', `/files/${up.id}/a.mp4`)).res.headers.get('location')).toContain('inline=true&mime=video%2Fmp4');
    expect((await t.call('GET', `/files/${up.id}/a.mp4?dl=1`)).res.headers.get('location')).toContain('inline=false&mime=application%2Foctet-stream');
    // 文档的封面和阅读器跳到 COS 现转的地址；别的文件不能预览
    expect((await t.call('GET', `/files/${up.id}/a.pdf?preview=cover`)).res.headers.get('location')).toBe(`memory://preview/${up.id}?srcType=pdf&as=cover`);
    expect((await t.call('GET', `/files/${up.id}/报价.XLSX?preview=viewer`)).res.headers.get('location')).toBe(`memory://preview/${up.id}?srcType=xlsx&as=viewer`);
    expect((await t.call('GET', `/files/${up.id}/a.zip?preview=cover`)).status).toBe(400);
    expect((await t.call('GET', `/files/${up.id}/a.pdf`)).res.headers.get('location')).toContain('inline=false');
    const raw = await t.call('GET', `/files/${up.id}/a.png?raw=1`);
    expect([raw.status, raw.data, raw.res.headers.get('content-type')]).toEqual([200, 'PNG', 'image/png']);
    // 跳转前不先问 COS 文件在不在（文件没了由 COS 回 404）；本站转发的才知道
    expect((await t.call('GET', `/files/${newFileId()}/a.png?raw=1`)).status).toBe(404);
    expect((await t.call('GET', '/files/..%2Fboards.json/a.png')).status).toBe(400);
  });
  it('超过 100 MB：领地址时先挡；实际传上来的超了，建元素时拒绝并删掉文件', async () => {
    const b = await t.firstBoard();
    expect((await t.call('POST', '/uploads', { size: MAX_FILE + 1 })).status).toBe(400);
    const up = (await t.call('POST', '/uploads', { size: 3 })).data;
    t.files.upload(up.url, 'big');
    const size = vi.spyOn(t.files, 'size').mockResolvedValue(MAX_FILE + 1);
    const r = await t.call('POST', `/boards/${b}/items`, { type: 'file', file: { id: up.id, name: 'a.bin', size: 3, mime: '' }, x: 1, y: 1 });
    size.mockRestore();
    expect([r.status, r.data.error]).toEqual([400, '文件超过 100 MB']);
    expect(await t.files.size(up.id)).toBeNull();
    expect(await t.itemsOf(b)).toEqual([]);
  });
  it('快捷指令传来的超过 100 MB：「上传中」的卡片连文件一起删掉', async () => {
    const b = await t.firstBoard();
    const url = (await t.call('POST', '/share/file', { board: '共用', name: '大视频', ext: 'mov' })).data as string;
    t.files.upload(url, 'big');
    const size = vi.spyOn(t.files, 'size').mockResolvedValue(MAX_FILE + 1);
    expect(await t.itemsOf(b)).toEqual([]);
    size.mockRestore();
    expect(t.files.data.size).toBe(0);
  });
});

describe('提醒', () => {
  it('设、改、知道了，索引跟着变；提醒晚于到期就推后到期', async () => {
    const b = await t.firstBoard();
    const it = (await t.call('POST', `/boards/${b}/items`, note({ ttl: 600 }))).data;
    const at = Date.now() + 2 * DAY;
    const r = (await t.call('PATCH', `/boards/${b}/items/${it.id}`, { remindAt: at })).data;
    expect(r.expiresAt).toBe(at + DAY);
    expect((await t.call('GET', '/reminders')).data.reminders).toEqual([{ itemId: it.id, boardId: b, remindAt: at }]);
    await t.call('PATCH', `/boards/${b}/items/${it.id}`, { remindAt: at + 1000 });
    expect((await t.call('GET', '/reminders')).data.reminders).toEqual([{ itemId: it.id, boardId: b, remindAt: at + 1000 }]);
    await t.call('PATCH', `/boards/${b}/items/${it.id}`, { remindDone: true });
    expect((await t.call('GET', '/reminders')).data.reminders).toEqual([]);
  });
  it('挪到别的白板索引跟着走；进了废纸篓不再提醒，放回来又有', async () => {
    const [a, b] = await t.boardIds();
    const it = (await t.call('POST', `/boards/${a}/items`, note())).data;
    const at = Date.now() + 3600_000;
    await t.call('PATCH', `/boards/${a}/items/${it.id}`, { remindAt: at });
    await t.call('POST', `/boards/${a}/items/${it.id}/move`, { to: b });
    expect((await t.call('GET', '/reminders')).data.reminders).toEqual([{ itemId: it.id, boardId: b, remindAt: at }]);
    await t.call('DELETE', `/boards/${b}/items/${it.id}`);
    expect((await t.call('GET', '/reminders')).data.reminders).toEqual([]);
    await t.call('POST', `/boards/trash/items/${it.id}/move`, {});
    expect((await t.call('GET', '/reminders')).data.reminders).toHaveLength(1);
  });
});

describe('快捷指令', () => {
  it('share/text 按名字找白板，自动挑空位；内容原样存成便利贴，不猜它是什么', async () => {
    const r = await t.call('POST', '/share/text', { board: '牛牛', text: '手机发来的' });
    expect(r.data).toMatchObject({ ok: true, board: '牛牛', type: 'note' });
    const niu = (await t.boardIds())[1];
    expect((await t.call('POST', '/share/text', { board: '牛牛', text: '30.5728,104.0668' })).data.type).toBe('note');
    const [a, b] = await t.itemsOf(niu);
    expect(Math.abs(a.x - b.x) >= 240 || Math.abs(a.y - b.y) >= 100).toBe(true);
    expect((await t.call('POST', '/share/text', { board: '不存在', text: 'x' })).status).toBe(404);
    expect((await t.call('POST', '/share/text', { board: '废纸篓', text: 'x' })).status).toBe(404);
  });
  it('share/link 存成「[标题](网址)」；标题没有或就是网址时只放网址', async () => {
    const b = await t.firstBoard();
    await t.call('POST', '/share/link', { board: '共用', url: 'https://example.com/a?b=1&c=(2)', title: '一个 [好] 标题' });
    expect(await t.itemsOf(b)).toMatchObject([{ type: 'note', text: '[一个 \\[好\\] 标题](https://example.com/a?b=1&c=%282%29)' }]);
    const niu = (await t.boardIds())[1];
    await t.call('POST', '/share/link', { board: '牛牛', url: 'https://example.com/x', title: 'https://example.com/x' });
    expect(await t.itemsOf(niu)).toMatchObject([{ type: 'note', text: 'https://example.com/x' }]);
    expect((await t.call('POST', '/share/link', { board: '共用', url: '不是网址' })).status).toBe(400);
    expect((await t.call('POST', '/share/link', { board: '不存在', url: 'https://example.com' })).status).toBe(404);
  });
  it('share/location 直接收经纬度；数字按文字发来也认，超范围的不收', async () => {
    const r = await t.call('POST', '/share/location', { board: '共用', lat: '30.5728', lng: 104.0668 });
    expect(r.data.type).toBe('location');
    expect(await t.itemsOf(await t.firstBoard())).toMatchObject([{ type: 'location', lat: 30.5728, lng: 104.0668, name: '' }]);
    expect((await t.call('POST', '/share/location', { board: '共用', lat: 91, lng: 0 })).status).toBe(400);
    expect((await t.call('POST', '/share/location', { board: '共用', lat: 'abc', lng: 0 })).status).toBe(400);
  });
  it('share/file 回纯文本地址，先建上传中的元素，文件到了自动转正常', async () => {
    const url = (await t.call('POST', '/share/file', { board: '共用', name: 'IMG_1', ext: 'HEIC' })).data as string;
    expect(url).toMatch(/^memory:\/\/upload\//);
    const b = await t.firstBoard();
    expect(await t.itemsOf(b)).toMatchObject([{ type: 'image', pending: true, file: { name: 'IMG_1.heic', mime: 'image/heic' } }]);
    t.files.upload(url, new Uint8Array(1234));
    expect(await t.itemsOf(b)).toMatchObject([{ type: 'image', pending: false, file: { size: 1234 } }]);
  });
  it('文件就是文件：txt、html 传上来也是文件卡片，不拆开看内容', async () => {
    const b = await t.firstBoard();
    const url = (await t.call('POST', '/share/file', { board: '共用', name: '文本', ext: 'txt' })).data as string;
    t.files.upload(url, '你好');
    expect(await t.itemsOf(b)).toMatchObject([{ type: 'file', pending: false, file: { name: '文本.txt' } }]);
  });
});

describe('位置', () => {
  it('建位置卡片；改名、补缩略图，换缩略图时旧的删掉', async () => {
    const b = await t.firstBoard();
    const it = (await t.call('POST', `/boards/${b}/items`, { type: 'location', lat: 30.57, lng: 104.06, x: 10, y: 50 })).data;
    expect(it).toMatchObject({ type: 'location', lat: 30.57, lng: 104.06, name: '' });
    const thumb = (id: string) => ({ id, name: 'map.jpg', size: 2, mime: 'image/jpeg' });
    const [f1, f2] = [newFileId(), newFileId()];
    t.files.upload(f1, 'a1');
    t.files.upload(f2, 'a2');
    expect((await t.call('PATCH', `/boards/${b}/items/${it.id}`, { name: '天府广场', thumb: thumb(f1) })).data).toMatchObject({ name: '天府广场', thumb: { id: f1 } });
    await t.call('PATCH', `/boards/${b}/items/${it.id}`, { thumb: thumb(f2) });
    expect([...t.files.data.keys()]).toEqual([f2]);
    expect((await t.call('POST', `/boards/${b}/items`, { type: 'location', lat: 130, lng: 104, x: 1, y: 1 })).status).toBe(400);
  });
});

describe('高德分享链接', () => {
  const short = 'https://surl.amap.com/17ncUA1Mya0I';
  const target = 'https://wb.amap.com/?p=B001C8N36X%2C30.519278%2C104.053520%2C%E5%9B%9B%E5%96%9C%E9%9D%92%E8%8F%9C%E5%85%83%E5%AD%90%2C%E5%9C%B0%E5%9D%80&src=app_share';
  const stub = (res: () => Response | Promise<Response>) => vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    expect(url).toBe(short);
    return res();
  }));
  afterEach(() => vi.unstubAllGlobals());

  it('share/link 发来高德短链 → 带名字的位置卡片，坐标换成 WGS-84', async () => {
    stub(() => new Response(null, { status: 302, headers: { location: target } }));
    const r = await t.call('POST', '/share/link', { board: '共用', url: short, title: short });
    expect(r.data.type).toBe('location');
    const [loc] = await t.itemsOf(await t.firstBoard());
    expect(loc).toMatchObject({ type: 'location', name: '四喜青菜元子' });
    expect(loc.lat).toBeCloseTo(30.5217, 2);
    expect(loc.lng).toBeCloseTo(104.051, 2);
  });
  it('苹果地图链接不用联网就变位置卡片', async () => {
    const r = await t.call('POST', '/share/link', { board: '共用', url: 'https://maps.apple.com/place?coordinate=1.366097,103.871558&name=%E5%B7%B2%E6%A0%87%E8%AE%B0%E4%BD%8D%E7%BD%AE&map=explore' });
    expect(r.data.type).toBe('location');
    expect((await t.itemsOf(await t.firstBoard()))[0]).toMatchObject({ lat: 1.366097, lng: 103.871558, name: '已标记位置' });
  });
  it('短链解不开就照普通链接存', async () => {
    stub(() => { throw new Error('超时'); });
    expect((await t.call('POST', '/share/link', { board: '共用', url: short })).data.type).toBe('note');
    stub(() => new Response('', { status: 404 }));
    expect((await t.call('POST', '/share/link', { board: '共用', url: short })).data.type).toBe('note');
  });
});

describe('每天的清理', () => {

  it('到期的进废纸篓、废纸篓满期的真删、孤儿文件、传不上来的、对不上的提醒', async () => {
    const b = await t.firstBoard();
    const now = Date.now();
    const mk = async (body: unknown) => (await t.call('POST', `/boards/${b}/items`, body)).data;
    const expired = await mk(note({ text: '到期' }));
    const gone = await mk(note({ text: '废纸篓里满期' }));
    const trashed = (await t.call('DELETE', `/boards/${b}/items/${gone.id}`)).data.item;
    await t.blob.setJSON(`items/trash/${gone.id}.json`, { ...trashed, expiresAt: now - 1 });
    const keepFile = newFileId(), orphanOld = newFileId(now - 2 * DAY), orphanNew = newFileId();
    for (const f of [keepFile, orphanOld, orphanNew]) t.files.upload(f, 'x');
    await mk({ type: 'file', file: { id: keepFile, name: 'a.bin', size: 1, mime: '' }, x: 1, y: 1 });
    await t.call('POST', '/share/file', { board: '共用', name: '没传完', ext: 'bin' });
    // 直接读存储：走接口读会顺手把到期的先处理掉
    const [stuckKey, stuck] = [...t.blob.data.entries()].map(([k, v]) => [k, JSON.parse(v.body)] as const).find(([, v]) => v.pending)!;
    await t.blob.setJSON(stuckKey, { ...stuck, createdAt: now - 2 * DAY });
    // 放到最后改：前面走接口读白板的步骤会顺手把到期的先处理掉
    await t.blob.setJSON(`items/${b}/${expired.id}.json`, { ...expired, expiresAt: now - 1 });
    await t.blob.setJSON(`reminders/${String(now).padStart(13, '0')}-${b}-${'0'.repeat(16)}`, 1);

    // 一次只清一批；调到它说做完为止
    let r = await t.call('POST', '/cron/cleanup', undefined, {});
    expect(r.data.done).toBe(false);
    for (let n = 0; !r.data.done && n < 20; n++) r = await t.call('POST', '/cron/cleanup', undefined, {});
    expect(r.data).toEqual({ expired: 2, stalePending: 1, orphanFiles: 1, staleReminders: 1, done: true });
    expect((await t.itemsOf(b)).map((i) => i.type)).toEqual(['file']);
    expect(await t.itemsOf('trash')).toMatchObject([{ id: expired.id }]);
    expect([...t.files.data.keys()].sort()).toEqual([keepFile, orphanNew].sort());
  });
  it('元素多了分好几批，中途不会拿半份名单去删文件；做完后下一次调用是新的一轮', async () => {
    const b = await t.firstBoard();
    const old = newFileId(Date.now() - 2 * DAY);
    t.files.upload(old, 'x');
    for (let i = 0; i < 45; i++) await t.call('POST', `/boards/${b}/items`, i === 44 ? { type: 'file', file: { id: old, name: 'a.bin', size: 1, mime: '' }, x: 1, y: 1 } : note({ text: `第 ${i} 张` }));
    let r = await t.call('POST', '/cron/cleanup', undefined, {}), calls = 1;
    for (; !r.data.done && calls < 20; calls++) {
      expect(t.files.data.has(old)).toBe(true);
      r = await t.call('POST', '/cron/cleanup', undefined, {});
    }
    expect(calls).toBe(4); // 45 个元素：15 + 15 + 15，再加收尾
    expect(r.data).toMatchObject({ expired: 0, orphanFiles: 0, done: true });
    expect(t.files.data.has(old)).toBe(true);
    expect(await t.blob.get('cleanup/state.json')).toBeNull();
    expect((await t.call('POST', '/cron/cleanup', undefined, {})).data.done).toBe(false);
  });
});

describe('元素很多时分批', () => {
  it('按 id 取元素必须带 ids，一次最多一批', async () => {
    const b = await t.firstBoard();
    expect((await t.call('GET', `/boards/${b}/items`)).status).toBe(400);
    const ids = Array.from({ length: BATCH + 1 }, () => newId()).join(',');
    expect((await t.call('GET', `/boards/${b}/items?ids=${ids}`)).status).toBe(400);
  });
  it('清空废纸篓一次删一批，接着调到删完', async () => {
    const b = await t.firstBoard();
    for (let i = 0; i < 23; i++) {
      const it = (await t.call('POST', `/boards/${b}/items`, note())).data;
      await t.call('DELETE', `/boards/${b}/items/${it.id}`);
    }
    expect((await t.call('DELETE', '/boards/trash/items')).data).toEqual({ removed: 6, remaining: 17 });
    for (let i = 0; i < 2; i++) await t.call('DELETE', '/boards/trash/items');
    expect((await t.call('DELETE', '/boards/trash/items')).data).toEqual({ removed: 5, remaining: 0 });
    expect(await t.itemsOf('trash')).toEqual([]);
  });
  it('删白板：元素没挪完之前白板还在', async () => {
    const [, second] = await t.boardIds();
    for (let i = 0; i < 12; i++) await t.call('POST', `/boards/${second}/items`, note());
    expect((await t.call('DELETE', `/boards/${second}`)).data).toEqual({ ok: true, trashed: 6, remaining: 6 });
    expect(await t.boardIds()).toContain(second);
    expect((await t.call('DELETE', `/boards/${second}`)).data).toEqual({ ok: true, trashed: 6, remaining: 0 });
    expect(await t.boardIds()).not.toContain(second);
    expect(await t.itemsOf('trash')).toHaveLength(12);
  });
  it('手机分享挑空位时只参考一批元素，白板再满也能发进来', async () => {
    const b = await t.firstBoard();
    for (let i = 0; i < 45; i++) await t.call('POST', `/boards/${b}/items`, note({ x: 100 + i * 10, y: 100 }));
    expect((await t.call('POST', '/share/text', { board: '共用', text: '还能发' })).data.type).toBe('note');
    expect(await t.itemsOf(b)).toHaveLength(46);
  });
});
