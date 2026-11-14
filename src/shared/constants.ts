// 不依赖 zod 的常量和小工具：前端只从这里取值，免得把 zod 打进页面
export const TRASH = 'trash';
export const MAX_FILE = 100 * 1024 * 1024;
export const MAX_TEXT = 50_000;
export const DAY = 86400_000;
/** 新内容默认保留多久（秒） */
export const DEFAULT_TTL = 7 * 86400;
export const TTL_CHOICES = [600, 3600, 86400, 7 * 86400, 30 * 86400] as const;
/** 进了废纸篓再留多久才真删（毫秒） */
export const TRASH_KEEP = 30 * DAY;
export const COLORS = ['yellow', 'pink', 'blue', 'green', 'purple', 'orange'] as const;
export const INLINE_IMAGE_EXT: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp',
  // iPhone 照片原格式；Safari 能直接显示，其他浏览器由前端转成 JPEG 再显示
  heic: 'image/heic', heif: 'image/heif',
};
/** 能在卡片上直接播放的音频和视频（卡片类型仍是「文件」） */
export const MEDIA_EXT: Record<string, string> = {
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac',
};
/** 能预览的文档：封面和翻看都由 COS 的文档预览生成，自己不渲染 */
export const DOC_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
export type PreviewKind = 'video' | 'audio' | 'doc';
export function previewKind(name: string): PreviewKind | null {
  const ext = extOf(name);
  if (DOC_EXT.includes(ext)) return 'doc';
  return (MEDIA_EXT[ext]?.split('/')[0] as PreviewKind | undefined) ?? null;
}
/**
 * 边缘函数一次执行大约只能发 64 个请求，超了存储就报 502；而读一个元素有时要算两个请求
 * （线上实测：一次读 32 个没事，34 个开始失败）。所以凡是要读很多元素的地方都分批，一批最多这么多个
 */
export const BATCH = 25;
/** 文件 ID：「base36 时间戳-24 位 hex」，从 key 就能看出多旧 */
export const FILE_ID_RE = /^[0-9a-z]{6,12}-[0-9a-f]{24}$/;
export const ITEM_ID_RE = /^[0-9a-f]{16}$/;

export const extOf = (name: string) => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '');
export const isInlineImage = (name: string) => !!INLINE_IMAGE_EXT[extOf(name)];

export function expiryFrom(ttl: number | null, now: number): number | null {
  return ttl === null ? null : now + ttl * 1000;
}
export const isAlive = (it: { expiresAt: number | null }, now: number) => it.expiresAt === null || it.expiresAt > now;
