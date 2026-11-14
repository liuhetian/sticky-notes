// ID 生成：前端也用（新建元素先在本机出现，id 由本机定）
import { FILE_ID_RE } from './constants';

function randomHex(bytes: number): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const newId = () => randomHex(8);
export const newBoardId = () => randomHex(6);
export const newLinkId = () => randomHex(4);
export const newFileId = (now = Date.now()) => `${now.toString(36)}-${randomHex(12)}`;

/** 文件 ID 里带的创建时间 */
export const fileIdTime = (id: string): number | null => (FILE_ID_RE.test(id) ? parseInt(id.split('-')[0], 36) : null);
