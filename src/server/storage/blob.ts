/** 只用到 @edgeone/pages-blob 的这几个方法；测试里换成内存实现 */
export interface BlobLike {
  get(key: string, opts: { type: 'json'; consistency?: 'strong' | 'eventual' }): Promise<any>;
  setJSON(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  list(opts: { prefix?: string; consistency?: 'strong' | 'eventual' }): Promise<{ blobs: { key: string; etag: string }[] }>;
}
