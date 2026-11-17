// 清库：把线上所有白板上的元素删掉（连同文件），白板列表保留。数据格式变了、不做兼容时用；找不回来，先 npm run backup。
// 走接口一步步删：各白板的元素进废纸篓 → 清空废纸篓 → 把每天的清理跑完（删掉没人引用的文件和旧的清理进度）
// 用法：npx tsx scripts/wipe.ts --yes
import { BASE, siteClient } from './lib/site';

if (!process.argv.includes('--yes')) {
  console.log(`会删掉 ${BASE} 上的所有元素和文件，找不回来。先 npm run backup，确认后加 --yes 再跑`);
  process.exit(1);
}
const call = await siteClient();
const must = async (method: string, path: string, body?: unknown) => {
  const r = await call(method, path, body);
  if (r.status >= 400) throw new Error(`${method} ${path} → ${r.status}：${JSON.stringify(r.data).slice(0, 200)}`);
  return r.data;
};

const { boards } = await must('GET', '/boards');
for (const b of boards as { id: string; name: string }[]) {
  if (b.id === 'trash') continue;
  const ids = ((await must('GET', `/boards/${b.id}/etags`)).items as { id: string }[]).map((e) => e.id);
  for (const id of ids) await must('DELETE', `/boards/${b.id}/items/${id}`);
  console.log(`「${b.name}」${ids.length} 个进了废纸篓`);
}
let removed = 0;
for (let i = 0; i < 500; i++) {
  const r = await must('DELETE', '/boards/trash/items');
  removed += r.removed;
  if (!r.remaining || !r.removed) break;
}
console.log(`废纸篓清空：彻底删掉 ${removed} 个`);
let cron = await must('POST', '/cron/cleanup');
for (let i = 0; !cron.done && i < 500; i++) cron = await must('POST', '/cron/cleanup');
console.log(`清理跑完：${JSON.stringify(cron)}`);
