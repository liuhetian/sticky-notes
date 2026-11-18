import { serializeSigned } from 'hono/utils/cookie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BATCH, BOARD_FULL, BOARD_MAX, DAY, FAULTS, MAX_FILE, TRASH_KEEP } from '../src/shared/constants';
import { newFileId, newId } from '../src/shared/ids';
import { AS, ENV, note, setup } from './helpers';

let t: ReturnType<typeof setup>;
beforeEach(() => { t = setup(); });

describe('鉴权', () => {
  it('不带凭证 401，密码错 401；X-Password 要带名字，名字要认识', async () => {
    expect((await t.call('GET', '/boards', undefined, {})).status).toBe(401);
    expect((await t.call('GET', '/boards', undefined, AS('niuniu', 'nope'))).status).toBe(401);
    expect((await t.call('GET', '/boards', undefined, { 'X-Password': 'pw-test' })).data.error).toContain('少了名字');
    expect((await t.call('GET', '/boards', undefined, AS('dami'))).data.error).toContain('不认识「dami」');
    // 密码里可以有 #：按最后一个切
    expect((await t.call('GET', '/me', undefined, AS('banana', 'a#b'), { ...ENV, SITE_PASSWORD: 'a#b' })).data).toEqual({ ok: true, name: 'banana' });
  });
  it('登录要选名字，cookie 里记着是谁；改了密码旧 cookie 失效；没有名字的 cookie 不算登录', async () => {
    expect((await t.call('POST', '/login', { password: 'bad', name: 'niuniu' }, {})).status).toBe(401);
    expect((await t.call('POST', '/login', { password: 'pw-test', name: 'dami' }, {})).status).toBe(400);
    const ok = await t.call('POST', '/login', { password: 'pw-test', name: 'banana' }, {});
    expect(ok.data).toEqual({ ok: true, name: 'banana' });
    const cookie = ok.res.headers.get('set-cookie')!;
    expect(cookie).toMatch(/clip_auth=.*HttpOnly/);
    const headers = { Cookie: cookie.split(';')[0] };
    expect((await t.call('GET', '/me', undefined, headers)).data).toEqual({ ok: true, name: 'banana' });
    expect((await t.call('GET', '/me', undefined, headers, { ...ENV, SITE_PASSWORD: 'changed' })).status).toBe(401);
    expect((await t.call('GET', '/me', undefined, headers, { ...ENV, AI_PASSWORD: 'changed' })).status).toBe(200);
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const bare = (await serializeSigned('clip_auth', String(exp), `${ENV.COOKIE_SECRET}\n${ENV.SITE_PASSWORD}`)).split(';')[0];
    expect((await t.call('GET', '/me', undefined, { Cookie: bare })).status).toBe(401);
  });
  it('AI 的密码只能调 /api/ai/，也不能登录网页；名字列表不用登录', async () => {
    expect((await t.call('GET', '/ai/boards', undefined, AS('ai', 'ai-test'))).status).toBe(200);
    expect((await t.call('GET', '/boards', undefined, AS('ai', 'ai-test'))).status).toBe(403);
    expect((await t.call('POST', '/login', { password: 'ai-test', name: 'ai' }, {})).status).toBe(401);
    expect((await t.call('GET', '/names', undefined, {})).data).toEqual({ names: { banana: '香蕉', niuniu: '牛牛', ai: 'AI' }, login: ['banana', 'niuniu'] });
  });
});

describe('白板', () => {
  it('第一次读：共用、牛牛、香蕉 + 最后的故障白板、废纸篓', async () => {
    const { data } = await t.call('GET', '/boards');
    expect(data.boards.map((b: any) => b.name)).toEqual(['共用', '牛牛', '香蕉', '故障', '废纸篓']);
    expect(data.boards.at(-1).id).toBe('trash');
  });
  it('新建插在故障白板前；废纸篓不能改名不能删', async () => {
    await t.call('POST', '/boards', { name: '新的' });
    const names = (await t.call('GET', '/boards')).data.boards.map((b: any) => b.name);
    expect(names.slice(-3)).toEqual(['新的', '故障', '废纸篓']);
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
  it('最近编辑者：新建和改内容才记，拖动、换颜色、提醒不算', async () => {
    const b = await t.firstBoard();
    const it = (await t.call('POST', `/boards/${b}/items`, note())).data;
    expect(it).toMatchObject({ by: 'niuniu', editedAt: it.createdAt });
    const patch = async (body: unknown, who = 'banana') => (await t.call('PATCH', `/boards/${b}/items/${it.id}`, body, AS(who))).data;
    expect(await patch({ x: 300, color: 'blue', remindAt: Date.now() + DAY, ttl: 600 })).toMatchObject({ by: 'niuniu', editedAt: it.editedAt });
    expect(await patch({ text: '你好' })).toMatchObject({ by: 'niuniu' }); // 文字没变不算
    const edited = await patch({ text: '香蕉改的' });
    expect(edited.by).toBe('banana');
    expect(edited.editedAt).toBeGreaterThanOrEqual(it.editedAt);
    const loc = (await t.call('POST', `/boards/${b}/items`, { type: 'location', lat: 1, lng: 2, x: 1, y: 1 })).data;
    expect((await t.call('PATCH', `/boards/${b}/items/${loc.id}`, { name: '家' }, AS('banana'))).data.by).toBe('banana');
  });
  it('不给位置就自动挑空位，不压着别的', async () => {
    const b = await t.firstBoard();
    const a = (await t.call('POST', `/boards/${b}/items`, { type: 'note', text: '一' })).data;
    const c = (await t.call('POST', `/boards/${b}/items`, { type: 'note', text: '二' })).data;
    expect(Math.abs(a.x - c.x) >= 240 || Math.abs(a.y - c.y) >= 100).toBe(true);
  });
});

describe('改文字：原文换新文', () => {
  const setupNote = async (text: string) => {
    const b = await t.firstBoard();
    const it = (await t.call('POST', `/boards/${b}/items`, note({ text }))).data;
    return { b, it, edit: (body: unknown) => t.call('PATCH', `/boards/${b}/items/${it.id}`, body) };
  };
  it('原文恰好出现一次才换；old 为空在末尾加一行；不用带 baseRev', async () => {
    const { edit } = await setupNote('- [ ] 买菜\n- [ ] 买花');
    expect((await edit({ old: '- [ ] 买菜', new: '- [x] 买菜', baseRev: 0 })).data.text).toBe('- [x] 买菜\n- [ ] 买花');
    expect((await edit({ old: '', new: '- [ ] 买米' })).data.text).toBe('- [x] 买菜\n- [ ] 买花\n- [ ] 买米');
    expect((await edit({ new: '$& 不会被当成替换符号' })).data.text).toContain('\n$& 不会被当成替换符号');
  });
  it('找不到回 409 带最新的；出现多次回 400；写法不对回 400', async () => {
    const { b, edit } = await setupNote('一 二 一');
    const miss = await edit({ old: '三', new: '四' });
    expect(miss.status).toBe(409);
    expect(miss.data.item.text).toBe('一 二 一');
    expect(miss.data.error).toContain('没找到');
    const many = await edit({ old: '一', new: '壹' });
    expect([many.status, many.data.error]).toEqual([400, expect.stringContaining('出现了 2 次')]);
    expect((await edit({ old: '二' })).status).toBe(400);
    expect((await edit({ old: '二', new: '贰', text: '整段' })).status).toBe(400);
    const loc = (await t.call('POST', `/boards/${b}/items`, { type: 'location', lat: 1, lng: 2, x: 1, y: 1 })).data;
    expect((await t.call('PATCH', `/boards/${b}/items/${loc.id}`, { old: '', new: 'x' })).status).toBe(400);
  });
});

describe('白板上限', () => {
  it('满 50 个以后新建、移进来、从废纸篓放回、快捷指令都被拒', async () => {
    const [a, b] = await t.boardIds();
    await t.fill(a, BOARD_MAX);
    const full = await t.call('POST', `/boards/${a}/items`, note());
    expect([full.status, full.data.error]).toEqual([409, BOARD_FULL]);
    expect((await t.call('POST', '/share/text', { board: '共用', text: 'x' })).status).toBe(409);
    expect((await t.call('POST', '/share/file', { board: '共用', name: 'a', ext: 'png' })).status).toBe(409);
    const other = (await t.call('POST', `/boards/${b}/items`, note())).data;
    expect((await t.call('POST', `/boards/${b}/items/${other.id}/move`, { to: a })).status).toBe(409);
    // 从这块满的白板删一个进废纸篓，再塞满，就放不回去了
    const [first] = await t.itemsOf(a);
    await t.call('DELETE', `/boards/${a}/items/${first.id}`);
    await t.call('POST', `/boards/${a}/items`, note());
    expect((await t.call('POST', `/boards/trash/items/${first.id}/move`, {})).status).toBe(409);
    expect(await t.itemsOf(a)).toHaveLength(BOARD_MAX);
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
  it('最多留 50 个：修剪时把最早进去的彻底删掉，一次删两个', async () => {
    const [a, b] = await t.boardIds();
    const items = [...(await t.fill(a, 30)), ...(await t.fill(b, 23))];
    for (const it of items) await t.call('DELETE', `/boards/${it.boardId}/items/${it.id}`);
    // 进废纸篓的时间（expiresAt）挨个错开，第一个最早
    for (const [i, it] of items.entries()) {
      const key = `items/trash/${it.id}.json`;
      await t.blob.setJSON(key, { ...(await t.blob.get(key)), expiresAt: Date.now() + TRASH_KEEP - (100 - i) * 1000 });
    }
    expect((await t.call('POST', '/boards/trash/prune')).data).toEqual({ removed: 2, remaining: 1 });
    expect((await t.call('POST', '/boards/trash/prune')).data).toEqual({ removed: 1, remaining: 0 });
    expect((await t.call('POST', '/boards/trash/prune')).data).toEqual({ removed: 0, remaining: 0 });
    const left = new Set(((await t.call('GET', '/boards/trash/etags')).data.items as { id: string }[]).map((e) => e.id));
    expect(left.size).toBe(BOARD_MAX);
    expect(items.slice(0, 3).some((it) => left.has(it.id))).toBe(false);
    expect((await t.call('POST', `/boards/${a}/prune`)).status).toBe(400);
  });
});

describe('故障白板', () => {
  const fault = (over: Record<string, unknown> = {}) => ({ at: Date.UTC(2026, 10, 18, 13, 3, 5), method: 'GET', path: '/api/boards/abc/etags', status: 545, ms: 412, ...over });

  it('老数据里没有就补上，排在废纸篓前，只补一次', async () => {
    await t.blob.setJSON('boards.json', { boards: [{ id: 'a1', name: '共用', createdAt: 1 }, { id: 'trash', name: '废纸篓', createdAt: 1 }] });
    expect((await t.call('GET', '/boards')).data.boards.map((b: any) => b.id)).toEqual(['a1', FAULTS, 'trash']);
    expect((await t.blob.get('boards.json')).boards).toHaveLength(3);
    expect((await t.call('GET', '/boards')).data.boards).toHaveLength(3);
  });

  it('不能改名、不能删、不能往上贴、不能挪进去；删掉的能从废纸篓放回来', async () => {
    const [a] = await t.boardIds();
    expect((await t.call('PATCH', `/boards/${FAULTS}`, { name: 'x' })).status).toBe(400);
    expect((await t.call('DELETE', `/boards/${FAULTS}`)).status).toBe(400);
    expect((await t.call('POST', `/boards/${FAULTS}/items`, note())).status).toBe(400);
    expect((await t.call('POST', `/ai/boards/${encodeURIComponent('故障')}/items`, note(), AS('ai', 'ai-test'))).status).toBe(400);
    const mine = (await t.call('POST', `/boards/${a}/items`, note())).data;
    expect((await t.call('POST', `/boards/${a}/items/${mine.id}/move`, { to: '故障' })).status).toBe(400);
    const f = (await t.call('POST', '/faults', { faults: [fault()] })).data;
    expect((await t.call('DELETE', `/boards/${FAULTS}/items/${f.id}`)).data.item).toMatchObject({ boardId: 'trash', from: FAULTS });
    expect((await t.call('POST', `/boards/trash/items/${f.id}/move`, {})).data.to).toBe(FAULTS);
  });

  it('上报：建一张粉色便利贴，一行一次失败，北京时间，记上报的人，不到期；格式不对 400', async () => {
    const r = await t.call('POST', '/faults', { faults: [fault(), fault({ method: 'POST', path: '/api/faults', status: 0, ms: 3 })] }, AS('banana'));
    expect(r.status).toBe(201);
    expect(r.data).toMatchObject({ boardId: FAULTS, type: 'note', color: 'pink', by: 'banana', expiresAt: null });
    expect(r.data.text).toBe('接口失败 2 次\n11-18 21:03:05 GET /api/boards/abc/etags 545 412 ms\n11-18 21:03:05 POST /api/faults 网络不通 3 ms');
    expect(await t.itemsOf(FAULTS)).toHaveLength(1);
    expect((await t.call('POST', '/faults', { faults: [] })).status).toBe(400);
    expect((await t.call('POST', '/faults', { faults: [fault()] }, {})).status).toBe(401);
  });

  it('满 50 张时删掉最早的，不进废纸篓', async () => {
    const made: any[] = [];
    for (let i = 0; i < BOARD_MAX; i++) made.push((await t.call('POST', '/faults', { faults: [fault({ ms: i })] })).data);
    for (const [i, it] of made.entries()) {
      const key = `items/${FAULTS}/${it.id}.json`;
      await t.blob.setJSON(key, { ...(await t.blob.get(key)), createdAt: 1000 + i });
    }
    const last = (await t.call('POST', '/faults', { faults: [fault()] })).data;
    const left = new Set(((await t.call('GET', `/boards/${FAULTS}/etags`)).data.items as { id: string }[]).map((e) => e.id));
    expect(left.size).toBe(BOARD_MAX);
    expect(left.has(made[0].id)).toBe(false);
    expect(left.has(last.id)).toBe(true);
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
  it('点「知道了」：元素在就记下；已经不在了就把那条提醒删掉', async () => {
    const b = await t.firstBoard();
    const it = (await t.call('POST', `/boards/${b}/items`, note())).data;
    const at = Date.now() + 3600_000;
    await t.call('PATCH', `/boards/${b}/items/${it.id}`, { remindAt: at });
    expect((await t.call('POST', '/reminders/done', { itemId: it.id, boardId: b, remindAt: at })).status).toBe(200);
    expect((await t.itemsOf(b))[0].remindDone).toBe(true);
    const ghost = { itemId: '0'.repeat(16), boardId: b, remindAt: at };
    await t.blob.setJSON(`reminders/${String(at).padStart(13, '0')}-${b}-${ghost.itemId}`, 1);
    expect((await t.call('GET', '/reminders')).data.reminders).toEqual([ghost]);
    await t.call('POST', '/reminders/done', ghost);
    expect((await t.call('GET', '/reminders')).data.reminders).toEqual([]);
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
    expect((await t.call('POST', '/share/text', { board: '废纸篓', text: 'x' })).status).toBe(400);
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

  it('到期的进废纸篓、废纸篓满期的真删、孤儿文件、传不上来的', async () => {
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

    // 一次只清一批；调到它说做完为止
    let r = await t.call('POST', '/cron/cleanup', undefined, {});
    expect(r.data.done).toBe(false);
    for (let n = 0; !r.data.done && n < 20; n++) r = await t.call('POST', '/cron/cleanup', undefined, {});
    expect(r.data).toEqual({ expired: 2, stalePending: 1, trashPruned: 0, orphanFiles: 1, done: true });
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
  it('废纸篓超出 50 个的也修剪掉，修剪和收尾不在同一次调用里', async () => {
    const [a, b] = await t.boardIds();
    for (const it of [...(await t.fill(a, 27)), ...(await t.fill(b, 26))]) await t.call('DELETE', `/boards/${it.boardId}/items/${it.id}`);
    let r = await t.call('POST', '/cron/cleanup', undefined, {});
    for (let n = 0; !r.data.done && n < 20; n++) r = await t.call('POST', '/cron/cleanup', undefined, {});
    expect(r.data).toMatchObject({ trashPruned: 3, done: true });
    expect(await t.itemsOf('trash')).toHaveLength(BOARD_MAX);
  });
});

describe('一次读完整块白板', () => {
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
  it('手机分享挑空位时看整块白板，不压着任何一张', async () => {
    const b = await t.firstBoard();
    const before = await t.fill(b, 45);
    const { itemId } = (await t.call('POST', '/share/text', { board: '共用', text: '还能发' })).data;
    const fresh = (await t.itemsOf(b)).find((i) => i.id === itemId);
    expect(before.every((o) => Math.abs(o.x - fresh.x) >= 240 || Math.abs(o.y - fresh.y) >= 100)).toBe(true);
  });
  it('读的时候顺手做的事一次最多两个：到期的这次不返回，下一次才挪完', async () => {
    const b = await t.firstBoard();
    const items = await t.fill(b, 5);
    for (const it of items) await t.blob.setJSON(`items/${b}/${it.id}.json`, { ...it, expiresAt: Date.now() - 1 });
    expect(await t.itemsOf(b)).toEqual([]);
    expect((await t.call('GET', `/boards/${b}/etags`)).data.items).toHaveLength(3);
    expect(await t.itemsOf('trash')).toHaveLength(2);
  });
});

describe('给 AI 的接口', () => {
  const ai = (method: string, path: string, body?: unknown) => t.call(method, `/ai${path}`, body, AS('ai', 'ai-test'));
  it('白板写名字：一次读完，按最近编辑从新到旧；todo=1 只要没做完的；带上数量和上限', async () => {
    const b = await t.firstBoard();
    const x = (await t.call('POST', `/boards/${b}/items`, note({ text: '- [ ] 没做完' }))).data;
    const y = (await t.call('POST', `/boards/${b}/items`, note({ text: '- [x] 做完了' }))).data;
    const z = (await t.call('POST', `/boards/${b}/items`, note({ text: '普通' }))).data;
    await t.blob.setJSON(`items/${b}/${x.id}.json`, { ...x, editedAt: x.editedAt + 3000 });
    await t.blob.setJSON(`items/${b}/${z.id}.json`, { ...z, editedAt: z.editedAt + 2000 });
    const r = (await ai('GET', '/boards/共用')).data;
    expect(r).toMatchObject({ board: { id: b, name: '共用' }, count: 3, max: BOARD_MAX });
    expect(r.items.map((i: any) => i.id)).toEqual([x.id, z.id, y.id]);
    expect((await ai('GET', `/boards/${b}?todo=1`)).data.items.map((i: any) => i.id)).toEqual([x.id]);
    expect((await ai('GET', '/boards/没有这块')).data.error).toContain('现有的：共用、牛牛、香蕉、故障、废纸篓');
    expect((await ai('GET', '/boards/废纸篓')).data.board.id).toBe('trash');
  });
  it('新建默认白色、自动挑位置；改文字；删除进废纸篓、放回；不能彻底删除', async () => {
    const made = await ai('POST', '/boards/牛牛/items', { type: 'note', text: '- [ ] 一' });
    expect(made.status).toBe(201);
    expect(made.data).toMatchObject({ color: 'white', by: 'ai' });
    const id = made.data.id;
    expect((await ai('PATCH', `/boards/牛牛/items/${id}`, { old: '- [ ] 一', new: '- [x] 一' })).data.text).toBe('- [x] 一');
    expect((await ai('GET', `/boards/牛牛/items/${id}`)).data.text).toBe('- [x] 一');
    expect((await ai('DELETE', `/boards/牛牛/items/${id}`)).data.item.boardId).toBe('trash');
    expect((await ai('DELETE', `/boards/trash/items/${id}`)).status).toBe(400);
    expect((await ai('POST', `/boards/废纸篓/items/${id}/move`, {})).data.item.boardId).toBe(made.data.boardId);
    expect((await ai('POST', `/boards/牛牛/items/${id}/move`, { to: '香蕉' })).data.to).toBe((await t.boardIds())[2]);
  });
  it('读单个时顺手把文件到了的「上传中」转正；不开放的接口回 404 指向说明', async () => {
    const url = (await t.call('POST', '/share/file', { board: '共用', name: 'IMG_1', ext: 'png' })).data as string;
    const b = await t.firstBoard();
    const id = ((await t.call('GET', `/boards/${b}/etags`)).data.items as { id: string }[])[0].id;
    t.files.upload(url, 'PNG');
    expect((await ai('GET', `/boards/共用/items/${id}`)).data).toMatchObject({ pending: false, file: { size: 3 } });
    expect((await ai('POST', '/uploads', { size: 3 })).data.url).toMatch(/^memory:\/\/upload\//);
    const no = await ai('DELETE', '/boards/trash/items');
    expect([no.status, no.data.error]).toEqual([404, expect.stringContaining('/wiki/ai-api.md')]);
    expect((await ai('POST', '/boards', { name: 'x' })).status).toBe(404);
  });
});
