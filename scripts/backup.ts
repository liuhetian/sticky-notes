// 把线上所有白板和元素导出成本地 JSON（只读；文件本体在 COS 里，不在备份里）
// 和页面一样分批取：一次执行读不了太多元素。任何一步失败都直接报错，不写出不完整的备份
import { mkdirSync, writeFileSync } from 'node:fs';
import { BATCH } from '../src/shared/constants';
import { siteClient } from './lib/site';

const call = await siteClient();
const get = async (path: string) => {
  const r = await call('GET', path);
  if (r.status !== 200) throw new Error(`GET ${path} → ${r.status}：${JSON.stringify(r.data).slice(0, 200)}`);
  return r.data;
};

const { boards } = await get('/boards');
const items: Record<string, unknown[]> = {};
for (const b of boards) {
  const ids = ((await get(`/boards/${b.id}/etags`)).items as { id: string }[]).map((e) => e.id);
  items[b.id] = [];
  for (let i = 0; i < ids.length; i += BATCH) items[b.id].push(...(await get(`/boards/${b.id}/items?ids=${ids.slice(i, i + BATCH).join(',')}`)).items);
}
mkdirSync('backups', { recursive: true });
const file = `backups/backup-${Date.now()}.json`;
writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), boards, items }, null, 2), { mode: 0o600 });
console.log(`✅ ${file}：${boards.map((b: { id: string; name: string }) => `${b.name} ${items[b.id].length}`).join('、')}`);
