// 前后端共用的数据模型：服务端拿它校验请求，前端拿它推导类型
import { z } from 'zod';
import { COLORS, DEFAULT_TTL, FILE_ID_RE, ITEM_ID_RE, MAX_FILE, MAX_TEXT, TTL_CHOICES } from './constants';

/** 秒数；null 表示永久 */
export const Ttl = z.literal(TTL_CHOICES).nullable();
export const Color = z.enum(COLORS);
const Coord = z.number().int().min(0).max(20000);
const BoardId = z.string().regex(/^[0-9a-z]{1,40}$/);
const ItemId = z.string().regex(ITEM_ID_RE);
const Text = z.string().max(MAX_TEXT);

export const Board = z.object({
  id: BoardId,
  name: z.string().min(1).max(40),
  createdAt: z.number(),
});
export type Board = z.infer<typeof Board>;

export const FileRef = z.object({
  id: z.string().regex(FILE_ID_RE),
  name: z.string().min(1).max(200),
  size: z.number().int().min(0).max(MAX_FILE),
  mime: z.string().max(100),
});
export type FileRef = z.infer<typeof FileRef>;

// ── 连线 ──
/** 连线接在图片上的哪个点（0~1） */
export const Anchor = z.object({ px: z.number().min(0).max(1), py: z.number().min(0).max(1) });
export type Anchor = z.infer<typeof Anchor>;
/**
 * 图片、文件、位置连出去的线，存在发起的那张卡片上：a 是本端的锚点，b 是对端的；不写就是连整张卡片。
 * 便利贴连出去的线不存这里，写在文字里（shared/refs.ts）
 */
export const Link = z.object({
  id: z.string().regex(/^[0-9a-f]{8}$/),
  to: ItemId,
  a: Anchor.optional(),
  b: Anchor.optional(),
});
export type Link = z.infer<typeof Link>;
const Links = z.array(Link).max(80);

// ── 元素 ──
const ItemBase = z.object({
  id: ItemId,
  boardId: BoardId,
  x: Coord,
  y: Coord,
  createdAt: z.number(),
  updatedAt: z.number(),
  /** 毫秒时间戳；null 表示永久。在白板上到点就进废纸篓，在废纸篓里到点才真删 */
  expiresAt: z.number().nullable(),
  remindAt: z.number().nullable(),
  remindDone: z.boolean(),
  /** 每写一次加 1；改文字时用来发现别人刚改过。0 表示本机刚建、服务端还没确认 */
  rev: z.number().int().min(0),
  /** 最近一次编辑的人（名字的英文键，见部署配置 NAMES）和时间：新建和改内容才算，拖动、换颜色、改保留时长、提醒都不算 */
  by: z.string(),
  editedAt: z.number(),
  /** 在废纸篓里时，记下原来在哪块白板 */
  from: BoardId.optional(),
  links: Links.optional(),
});

const Lat = z.number().min(-90).max(90);
const Lng = z.number().min(-180).max(180);
const PlaceName = z.string().max(80);

export const NoteItem = ItemBase.extend({ type: z.literal('note'), text: Text, color: Color });
export const ImageItem = ItemBase.extend({ type: z.literal('image'), file: FileRef, pending: z.boolean().optional() });
export const FileItem = ItemBase.extend({ type: z.literal('file'), file: FileRef, pending: z.boolean().optional() });
/** 坐标一律存 WGS-84；thumb 是创建后生成一次的地图缩略图 */
export const LocationItem = ItemBase.extend({ type: z.literal('location'), lat: Lat, lng: Lng, name: PlaceName, thumb: FileRef.optional() });
export const Item = z.discriminatedUnion('type', [NoteItem, ImageItem, FileItem, LocationItem]);
export type NoteItem = z.infer<typeof NoteItem>;
export type LocationItem = z.infer<typeof LocationItem>;
export type Item = z.infer<typeof Item>;
export type ItemType = Item['type'];
export type FileLikeItem = Extract<Item, { type: 'image' | 'file' }>;

// ── 请求体 ──
/** id 由前端定：新建的元素不等服务端返回就先显示。不给位置就由服务端挑空位 */
const Place = { id: ItemId.optional(), x: Coord.optional(), y: Coord.optional(), ttl: Ttl.default(DEFAULT_TTL) };
export const CreateItem = z.discriminatedUnion('type', [
  /** 不给颜色时按入口定：网页黄色、AI 白色 */
  z.object({ type: z.literal('note'), text: Text.default(''), color: Color.optional(), ...Place }),
  z.object({ type: z.literal('image'), file: FileRef, ...Place }),
  z.object({ type: z.literal('file'), file: FileRef, ...Place }),
  z.object({ type: z.literal('location'), lat: Lat, lng: Lng, name: PlaceName.default(''), ...Place }),
]);
export type CreateItem = z.input<typeof CreateItem>;
/** 校验后（补上默认值）的新建请求 */
export type CreateItemBody = z.output<typeof CreateItem>;

export const PatchItem = z.strictObject({
  x: Coord.optional(),
  y: Coord.optional(),
  color: Color.optional(),
  text: Text.optional(),
  name: PlaceName.optional(),
  thumb: FileRef.optional(),
  ttl: Ttl.optional(),
  remindAt: z.number().nullable().optional(),
  remindDone: z.boolean().optional(),
  links: Links.optional(),
  /** 改文字时带上自己看到的 rev，和服务端对不上就回 409 */
  baseRev: z.number().int().optional(),
  /** 改文字的另一种写法：把原文 old 换成 new（old 要在便利贴里恰好出现一次）；old 为空就在末尾加一行 */
  old: Text.optional(),
  new: Text.optional(),
});
export type PatchItem = z.infer<typeof PatchItem>;

export const BoardName = z.object({ name: z.string().trim().min(1).max(40) });
/** to 是白板 id 或名字。从废纸篓放回时可以带 ttl（按默认保留时长重新计时）或 expiresAt（撤销删除：恢复原来的到期时间） */
export const MoveItem = z.object({ to: z.string().min(1).max(40).optional(), ttl: Ttl.optional(), expiresAt: z.number().nullable().optional() });
export type MoveItem = z.infer<typeof MoveItem>;
export const Login = z.object({ password: z.string().min(1), name: z.string().min(1).max(40) });
/** 领上传地址时先报大小，太大的直接挡掉；实际大小在建元素时再核对一次 */
export const UploadRequest = z.object({ size: z.number().int().min(1).max(MAX_FILE) });

// 快捷指令用：白板可以填 id，也可以直接填名字（共用、牛牛、香蕉）
export const ShareText = z.object({ board: z.string().min(1).max(40), text: z.string().min(1).max(MAX_TEXT) });
/** 标题是快捷指令里那一项的「名称」，常常就是网址本身 */
export const ShareLink = z.object({ board: z.string().min(1).max(40), url: z.string().regex(/^https?:\/\/\S+$/i).max(2000), title: z.string().max(300).default('') });
/** 快捷指令的 JSON 里数字有时会按文字发出来，这里一并认 */
export const ShareLocation = z.object({ board: z.string().min(1).max(40), lat: z.coerce.number().pipe(Lat), lng: z.coerce.number().pipe(Lng), name: PlaceName.default('') });
export const ShareFile = z.object({
  board: z.string().min(1).max(40),
  name: z.string().min(1).max(200),
  /** 快捷指令拿到的名字常常不带扩展名，单独给 */
  ext: z.string().max(10).optional(),
});

export interface IndexEntry { id: string; etag: string }
export const Reminder = z.object({ itemId: ItemId, boardId: BoardId, remindAt: z.number().int() });
export type Reminder = z.infer<typeof Reminder>;
