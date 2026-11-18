// 不依赖 zod 的常量和小工具：前端只从这里取值，免得把 zod 打进页面
export const TRASH = 'trash';
/** 系统白板「故障」：页面自动上报的接口失败记录，一次上报一张便利贴（docs/requirements.md「失败上报」） */
export const FAULTS = 'faults';
/** 废纸篓和故障白板：不能删、不能改名、不能直接往上贴 */
export const isSystemBoard = (id: string) => id === TRASH || id === FAULTS;
/** 本机最多攒几条还没报上去的失败记录 */
export const FAULT_QUEUE = 50;
export const MAX_FILE = 100 * 1024 * 1024;
export const MAX_TEXT = 50_000;
export const DAY = 86400_000;
/** 新内容默认保留多久（秒） */
export const DEFAULT_TTL = 7 * 86400;
export const TTL_CHOICES = [600, 3600, 86400, 7 * 86400, 30 * 86400] as const;
/** 进了废纸篓再留多久才真删（毫秒） */
export const TRASH_KEEP = 30 * DAY;
export const COLORS = ['yellow', 'pink', 'blue', 'green', 'purple', 'orange', 'white'] as const;
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
type PreviewKind = 'video' | 'audio' | 'doc';
export function previewKind(name: string): PreviewKind | null {
  const ext = extOf(name);
  if (DOC_EXT.includes(ext)) return 'doc';
  return (MEDIA_EXT[ext]?.split('/')[0] as PreviewKind | undefined) ?? null;
}
/**
 * 一次执行最多读几个元素。边缘函数一次执行大约只能发 62 个请求（线上实测在 62~64 之间浮动），超了存储就报错。
 * 新建的 store 还没凭据时并发读，每个读都会各自去换一次凭据（一个元素算两个请求），所以 Db.getItems 先单独读一个把凭据取好再并发。
 * 这样实测一次读 58 个都稳；定 50，读整块白板 = 换凭据 1 + 列名字 1 + 读 50，顺手的写操作还剩几次余量
 */
export const BATCH = 50;
/** 每块白板最多放几个元素（废纸篓也是）。不能大于 BATCH：读白板要一次读完 */
export const BOARD_MAX = 50;
export const BOARD_FULL = `这块白板满了（${BOARD_MAX} 个），先清理或换一块`;
/** 文件 ID：「base36 时间戳-24 位 hex」，从 key 就能看出多旧 */
export const FILE_ID_RE = /^[0-9a-z]{6,12}-[0-9a-f]{24}$/;
export const ITEM_ID_RE = /^[0-9a-f]{16}$/;

export const extOf = (name: string) => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '');
/** 按扩展名认图片：网页上传、快捷指令、聊天记录拆包都按这一条分图片卡和文件卡 */
export const imageMime = (name: string) => INLINE_IMAGE_EXT[extOf(name)] ?? '';
export const fileKind = (name: string): 'image' | 'file' => (imageMime(name) ? 'image' : 'file');

export function expiryFrom(ttl: number | null, now: number): number | null {
  return ttl === null ? null : now + ttl * 1000;
}
export const isAlive = (it: { expiresAt: number | null }, now: number) => it.expiresAt === null || it.expiresAt > now;
