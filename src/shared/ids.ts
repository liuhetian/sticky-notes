// ID 生成：前端也用（新建元素先在本机出现，id 由本机定）
export function randomHex(bytes: number): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const newId = () => randomHex(8);
export const newBoardId = () => randomHex(6);
export const newLinkId = () => randomHex(4);
export const newFileId = (now = Date.now()) => `${now.toString(36)}-${randomHex(12)}`;

/** 文件 ID 里带的创建时间 */
export function fileIdTime(id: string): number | null {
  const m = id.match(/^([0-9a-z]{6,12})-[0-9a-f]{24}$/);
  return m ? parseInt(m[1], 36) : null;
}
