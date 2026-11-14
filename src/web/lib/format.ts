import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { INLINE_IMAGE_EXT, extOf, isInlineImage } from '@/shared/constants';
import type { Item } from '@/shared/schema';
import { serverNow } from '../api/client';

dayjs.locale('zh-cn');

export const TTL_LABELS: [number | null, string][] = [[600, '10 分钟'], [3600, '1 小时'], [86400, '1 天'], [604800, '7 天'], [2592000, '30 天'], [null, '永久']];

export function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** 今天 14:03 / 昨天 14:03 / 明天 09:00 / 11月14日 09:00 */
export function fmtDay(t: number) {
  const d = dayjs(t), today = dayjs().startOf('day');
  const diff = d.startOf('day').diff(today, 'day');
  const hm = d.format('HH:mm');
  if (diff === 0) return `今天 ${hm}`;
  if (diff === -1) return `昨天 ${hm}`;
  if (diff === 1) return `明天 ${hm}`;
  return d.format(d.year() === today.year() ? 'M月D日 HH:mm' : 'YYYY年M月D日 HH:mm');
}

export function remain(it: Pick<Item, 'expiresAt'>) {
  if (it.expiresAt === null) return '永久';
  const ms = it.expiresAt - serverNow();
  if (ms <= 0) return '已过期';
  if (ms < 3600_000) return `${Math.ceil(ms / 60000)} 分钟`;
  if (ms < 48 * 3600_000) return `${Math.round(ms / 3600_000)} 小时`;
  return `${Math.round(ms / 86400_000)} 天`;
}
export const expiringSoon = (it: Pick<Item, 'expiresAt'>) => it.expiresAt !== null && it.expiresAt - serverNow() < 3600_000;
export const isRinging = (it: Item) => it.remindAt !== null && !it.remindDone && it.remindAt <= serverNow();

export function rotFor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return ((Math.abs(h) % 33) - 16) / 10; // -1.6° ~ 1.6°
}

export { isInlineImage };

export function extClass(name: string) {
  const e = extOf(name);
  if (INLINE_IMAGE_EXT[e] || ['svg', 'heic', 'tif', 'tiff', 'ico'].includes(e)) return 'img';
  if (e === 'pdf') return 'pdf';
  if (['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'xz', 'bz2'].includes(e)) return 'zip';
  if (['doc', 'docx', 'pages', 'rtf'].includes(e)) return 'doc';
  if (['xls', 'xlsx', 'csv', 'numbers', 'tsv'].includes(e)) return 'xls';
  if (['ppt', 'pptx', 'key'].includes(e)) return 'ppt';
  if (['mp4', 'mov', 'mkv', 'avi', 'webm', 'flv'].includes(e)) return 'vid';
  if (['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg'].includes(e)) return 'aud';
  if (['txt', 'md', 'json', 'log', 'js', 'py', 'ts', 'html', 'css', 'sh', 'yml', 'yaml'].includes(e)) return 'txt';
  return 'other';
}
export const extLabel = (name: string) => (extOf(name) || 'file').slice(0, 4).toUpperCase();

const MIME_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif', 'image/bmp': 'bmp' };
/** 截图粘贴进来叫 image.png，换成带时间的名字 */
export function fixName(file: File) {
  const ext = MIME_EXT[file.type];
  if (ext && (/^image\.\w+$/.test(file.name) || !file.name.includes('.'))) return `截图-${dayjs().format('YYYYMMDD-HHmmss')}.${ext}`;
  return file.name || 'file';
}
