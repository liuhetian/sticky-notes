// 线上冒烟：npm run smoke。跑完把自己建的测试数据彻底删掉
import { BASE, siteClient, sitePassword } from './lib/site';

const call = await siteClient();
let failed = 0;
const created: string[] = [];

function check(label: string, ok: boolean, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? `：${detail}` : ''}`);
}
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

// 静态页
const home = await fetch(`${BASE}/`);
const html = await home.text();
check('首页', home.status === 200 && html.includes('/assets/'), `${home.status}，${home.headers.get('cache-control')}`);
const js = html.match(/\/assets\/[^"]+\.js/)?.[0];
if (js) {
  const r = await fetch(BASE + js);
  check('脚本长缓存', r.status === 200 && /immutable/.test(r.headers.get('cache-control') ?? ''), r.headers.get('cache-control') ?? '');
}
check('manifest', (await fetch(`${BASE}/manifest.webmanifest`)).status === 200);

// 鉴权
check('匿名 401', (await call('GET', '/boards', undefined, {})).status === 401);
check('密码错 401', (await call('POST', '/login', { password: 'wrong' }, {})).status === 401);
const login = await call('POST', '/login', { password: await sitePassword() }, {});
const cookie = login.res.headers.get('set-cookie')?.split(';')[0] ?? '';
check('登录发 cookie', login.status === 200 && cookie.startsWith('clip_auth='));
check('带 cookie 访问', (await call('GET', '/me', undefined, { Cookie: cookie })).status === 200);

// 白板
const boards = (await call('GET', '/boards')).data.boards as { id: string; name: string }[];
check('白板列表', boards.at(-1)?.id === 'trash' && boards.length >= 2, boards.map((b) => b.name).join('/'));
const share = boards[0].id;
const first = boards[0].name;

// 元素：建（id 由前端定）、按字段合并、冲突、增量同步
const id = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('');
const note = (await call('POST', `/boards/${share}/items`, { id, type: 'note', text: '冒烟测试\n- [ ] 一', x: 100, y: 100, ttl: 600 })).data;
created.push(note.id);
check('建便利贴（id 由前端定）', note.id === id && note.rev === 1 && note.color === 'yellow');
check('同一个 id 重发不重复建', (await call('POST', `/boards/${share}/items`, { id, type: 'note', text: '重发', x: 1, y: 1 })).data.text === note.text);
await call('PATCH', `/boards/${share}/items/${id}`, { x: 300, y: 320 });
const merged = (await call('PATCH', `/boards/${share}/items/${id}`, { color: 'blue' })).data;
check('按字段合并', merged.x === 300 && merged.y === 320 && merged.color === 'blue' && merged.rev === 3, JSON.stringify({ x: merged.x, color: merged.color, rev: merged.rev }));
check('文字冲突 409', (await call('PATCH', `/boards/${share}/items/${id}`, { text: 'x', baseRev: 1 })).status === 409);
const idx = (await call('GET', `/boards/${share}/etags`)).data.items as { id: string; etag: string }[];
check('etags 带 etag', idx.some((e) => e.id === id && !!e.etag));
check('按 ids 取', (await call('GET', `/boards/${share}/items?ids=${id}`)).data.items[0]?.id === id);
check('locate', (await call('GET', `/items/${id}/locate`)).data.boardId === share);

// 提醒
const at = Date.now() + 3600_000;
await call('PATCH', `/boards/${share}/items/${id}`, { remindAt: at });
check('提醒进索引', (await call('GET', '/reminders')).data.reminders.some((r: any) => r.itemId === id && r.remindAt === at));
await call('PATCH', `/boards/${share}/items/${id}`, { remindDone: true });
check('知道了出索引', !(await call('GET', '/reminders')).data.reminders.some((r: any) => r.itemId === id));

// 废纸篓：删除是挪进去，留 30 天；放回原处
const del = (await call('DELETE', `/boards/${share}/items/${id}`)).data;
check('删除进废纸篓', del.item?.boardId === 'trash' && del.item.from === share && del.item.expiresAt > Date.now() + 29 * 86400_000);
check('进了废纸篓 locate 就找不到', (await call('GET', `/items/${id}/locate`)).status === 404);
const back = (await call('POST', `/boards/trash/items/${id}/move`, { expiresAt: note.expiresAt })).data;
check('放回原处、恢复到期时间', back.to === share && back.item.expiresAt === note.expiresAt);
check('废纸篓不能直接贴', (await call('POST', '/boards/trash/items', { type: 'note', text: 'x', x: 1, y: 1 })).status === 400);

// 上传：文件直接进 COS
const up = (await call('POST', '/uploads', { name: 'smoke.png', size: PNG.length, mime: 'image/png' })).data;
check('上传地址在 COS', /^https:\/\/[^/]+\.cos\.[^/]+\.myqcloud\.com\/file\//.test(up.url), up.url.split('?')[0]);
const pre = await fetch(up.url, { method: 'OPTIONS', headers: { Origin: BASE, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type' } });
check('桶允许本站跨域 PUT', pre.headers.get('access-control-allow-origin') === BASE, `${pre.status} ${pre.headers.get('access-control-allow-origin')}`);
const put = await fetch(up.url, { method: 'PUT', body: PNG, headers: { 'Content-Type': 'image/png' } });
check('预签名 PUT', put.ok, String(put.status));
const img = (await call('POST', `/boards/${share}/items`, { type: 'image', file: { id: up.id, name: 'smoke.png', size: PNG.length, mime: 'image/png' }, x: 600, y: 100 })).data;
created.push(img.id);
check('图片元素', img.type === 'image' && img.file.size === PNG.length);
const jump = await call('GET', `/files/${up.id}/smoke.png`);
const loc = jump.res.headers.get('location') ?? '';
check('图片跳到 COS 临时地址', jump.status === 302 && loc.includes('.myqcloud.com/'), String(jump.status));
const got = await fetch(loc);
// 2024 年以后建的桶走默认域名时，COS 一律加「当附件下载」的响应头；<img> 照样能显示，不受影响
check('临时地址取得到，类型是图片', got.status === 200 && got.headers.get('content-type') === 'image/png' && (await got.arrayBuffer()).byteLength === PNG.length,
  `${got.status} ${got.headers.get('content-type')}`);
const att = await fetch((await call('GET', `/files/${up.id}/smoke.html`)).res.headers.get('location') ?? '');
check('其他类型当附件', /^attachment/.test(att.headers.get('content-disposition') ?? '') && att.headers.get('content-type') === 'application/octet-stream');
const raw = await call('GET', `/files/${up.id}/smoke.png?raw=1`);
check('raw=1 由本站转发', raw.status === 200 && raw.res.headers.get('content-type') === 'image/png');
check('桶是私有的：不带签名取不到', (await fetch(loc.split('?')[0])).status === 403);

// 快捷指令
const idsOf = async (b: string) => new Set(((await call('GET', `/boards/${b}/etags`)).data.items as { id: string }[]).map((e) => e.id));
const fresh = async (b: string, before: Set<string>) => [...(await idsOf(b))].find((x) => !before.has(x))!;
const st = (await call('POST', '/share/text', { board: first, text: '冒烟：快捷指令文字' })).data;
created.push(st.itemId);
check('share/text 按名字找白板', st.board === first && st.type === 'note');
const sl = (await call('POST', '/share/location', { board: first, lat: 30.5728, lng: 104.0668 })).data;
created.push(sl.itemId);
check('share/location 建位置卡片', sl.type === 'location');
const sk = (await call('POST', '/share/link', { board: first, url: 'https://example.com/smoke', title: '冒烟：链接' })).data;
created.push(sk.itemId);
check('share/link 建链接便利贴', sk.type === 'note');
let seen = await idsOf(share);
const sfUrl = (await call('POST', '/share/file', { board: first, name: 'IMG_SMOKE', ext: 'png' })).data as string;
check('share/file 回纯文本地址', typeof sfUrl === 'string' && sfUrl.startsWith('https://'));
const sfId = await fresh(share, seen);
created.push(sfId);
const before = (await call('GET', `/boards/${share}/items?ids=${sfId}`)).data.items[0];
check('share/file 先建上传中', before?.pending === true && before.file.name === 'IMG_SMOKE.png');
await fetch(sfUrl, { method: 'PUT', body: PNG });
const after = (await call('GET', `/boards/${share}/items?ids=${sfId}`)).data.items[0];
check('传完转正常卡片', after?.pending === false && after.file.size === PNG.length, `size ${after?.file.size}`);
// 清理任务
// 一次只清一批，调到它说做完
let cron = await call('POST', '/cron/cleanup', undefined, {}), hops = 1;
for (; cron.status === 200 && !cron.data.done && hops < 100; hops++) cron = await call('POST', '/cron/cleanup', undefined, {});
check('每天的清理分批跑完', cron.status === 200 && cron.data.done === true, `${hops} 批 ${JSON.stringify(cron.data)}`);

// 测试数据：先进废纸篓，再从废纸篓里彻底删（中途失败停在别的白板的，先定位）
for (const x of created) {
  const where = (await call('GET', `/items/${x}/locate`)).data?.boardId;
  if (where) await call('DELETE', `/boards/${where}/items/${x}`);
  await call('DELETE', `/boards/trash/items/${x}`);
}
const left = (await idsOf('trash')).size;
console.log(failed ? `\n❌ ${failed} 项没过` : `\n✅ 全部通过，测试数据已删（废纸篓里还有 ${left} 项）`);
process.exit(failed ? 1 : 0);
