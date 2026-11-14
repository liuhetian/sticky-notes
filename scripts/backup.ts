// 把线上所有白板和元素导出成本地 JSON（只读；文件本体在 COS 里，不在备份里）
import { mkdirSync, writeFileSync } from 'node:fs';
import { siteClient } from './lib/site';

const call = await siteClient();
const { data } = await call('GET', '/boards');
const items: Record<string, unknown[]> = {};
for (const b of data.boards) items[b.id] = (await call('GET', `/boards/${b.id}/items`)).data?.items ?? [];
mkdirSync('backups', { recursive: true });
const file = `backups/backup-${Date.now()}.json`;
writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), boards: data.boards, items }, null, 2), { mode: 0o600 });
console.log(`✅ ${file}：${data.boards.map((b: any) => `${b.name} ${items[b.id].length}`).join('、')}`);
