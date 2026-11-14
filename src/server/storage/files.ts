// 文件本体（图片、附件、压缩包、地图缩略图）放在自己的 COS 桶里，对象名 file/<fileId>。
// 桶是私有的，浏览器只拿得到有时效的预签名地址
import { DAY } from '../../shared/constants';
import { cosSign } from './cos-sign';

export type Disposition = { name: string; mime: string; inline: boolean };

export interface FileStore {
  /** 浏览器或快捷指令直接 PUT 文件用的地址，15 分钟内有效 */
  uploadUrl(id: string): Promise<string>;
  /** 浏览器直接下载用的地址；同一天里签出来的地址相同，浏览器能缓存 */
  downloadUrl(id: string, d: Disposition): Promise<string>;
  /** 文档预览（COS 数据万象现转）：cover 是第一页的图，viewer 是能翻页的在线阅读器。srcType 是文档的扩展名 */
  previewUrl(id: string, srcType: string, as: 'cover' | 'viewer'): Promise<string>;
  /** 文件大小；还没传上来返回 null */
  size(id: string): Promise<number | null>;
  read(id: string): Promise<ArrayBuffer | null>;
  /** 原样转发文件内容（给要读像素的地方用，走本站域名就没有跨域问题） */
  open(id: string): Promise<ReadableStream<Uint8Array> | null>;
  write(id: string, data: Uint8Array, mime: string): Promise<void>;
  delete(id: string): Promise<void>;
  list(): Promise<{ id: string; modifiedAt: number }[]>;
}

const PREFIX = 'file/';
const nowSec = () => Math.floor(Date.now() / 1000);

export class CosFiles implements FileStore {
  private host: string;
  constructor(private o: { bucket: string; region: string; secretId: string; secretKey: string }) {
    this.host = `https://${o.bucket}.cos.${o.region}.myqcloud.com`;
  }

  private sign(method: string, path: string, query: Record<string, string>, start: number, expires: number) {
    return cosSign({ secretId: this.o.secretId, secretKey: this.o.secretKey, method, path, query, start, expires });
  }
  /** 预签名地址：签名放在查询串里 */
  private async presign(method: string, id: string, query: Record<string, string>, start: number, expires: number) {
    const path = `/${PREFIX}${id}`;
    const s = await this.sign(method, path, query, start, expires);
    return `${this.host}${path}?${s.query ? `${s.query}&` : ''}${s.auth}`;
  }
  /** 服务端自己发请求：签名放在请求头里，几分钟内有效（往前留一分钟，容得下时钟误差） */
  private async call(method: string, path: string, query: Record<string, string> = {}, init: RequestInit = {}) {
    const s = await this.sign(method, path, query, nowSec() - 60, 360);
    const res = await fetch(`${this.host}${path}${s.query ? `?${s.query}` : ''}`, { ...init, method, headers: { ...init.headers, Authorization: s.auth } });
    if (!res.ok && res.status !== 404) throw new Error(`COS ${method} ${res.status}`);
    return res;
  }
  private object(method: string, id: string, init?: RequestInit) {
    return this.call(method, `/${PREFIX}${id}`, {}, init);
  }

  uploadUrl(id: string) {
    return this.presign('PUT', id, {}, nowSec() - 60, 960);
  }

  /** 从当天零点起算、有效两天：同一天里地址不变，浏览器按地址缓存图片 */
  downloadUrl(id: string, d: Disposition) {
    const today = Math.floor(Date.now() / DAY) * (DAY / 1000);
    return this.presign('GET', id, {
      'response-content-type': d.mime,
      'response-content-disposition': `${d.inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(d.name)}`,
      'response-cache-control': 'private, max-age=86400',
    }, today, 2 * 86400);
  }

  /** 对象名没有扩展名，srcType 必须带；封面让浏览器缓存一天，免得每次显示都重新转一遍（转一次算一次钱） */
  previewUrl(id: string, srcType: string, as: 'cover' | 'viewer') {
    const today = Math.floor(Date.now() / DAY) * (DAY / 1000);
    const query: Record<string, string> = as === 'cover'
      ? { 'ci-process': 'doc-preview', srcType, page: '1', dstType: 'jpg', ImageParams: 'imageMogr2/thumbnail/520x/quality/80', 'response-cache-control': 'private, max-age=86400' }
      : { 'ci-process': 'doc-preview', srcType, dstType: 'html' };
    return this.presign('GET', id, query, today, 2 * 86400);
  }

  async size(id: string) {
    const res = await this.object('HEAD', id);
    return res.ok ? Number(res.headers.get('content-length') ?? 0) : null;
  }
  /** 分段取：边缘运行时一次读不下几 MB 以上的响应（报 OverSize），所以每次只要 4 MB，再拼起来 */
  async read(id: string) {
    const STEP = 4 * 1024 * 1024;
    const parts: Uint8Array[] = [];
    let total = Infinity, got = 0;
    while (got < total) {
      const res = await this.object('GET', id, { headers: { Range: `bytes=${got}-${got + STEP - 1}` } });
      if (res.status === 404) return null;
      const chunk = new Uint8Array(await res.arrayBuffer());
      // 206 带着总长度；空文件或不认 Range 时是 200，一次就是全部
      total = res.status === 206 ? Number(res.headers.get('content-range')?.split('/')[1] ?? chunk.length) : chunk.length;
      parts.push(chunk);
      got += chunk.length;
      if (!chunk.length) break;
    }
    const out = new Uint8Array(got);
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out.buffer;
  }
  async open(id: string) {
    const res = await this.object('GET', id);
    return res.ok ? res.body : null;
  }
  async write(id: string, data: Uint8Array, mime: string) {
    await this.object('PUT', id, { body: data.slice().buffer, headers: { 'Content-Type': mime || 'application/octet-stream' } });
  }
  async delete(id: string) {
    await this.object('DELETE', id);
  }

  async list() {
    const out: { id: string; modifiedAt: number }[] = [];
    let marker = '';
    do {
      const xml = await (await this.call('GET', '/', { prefix: PREFIX, ...(marker ? { marker } : {}) })).text();
      // 对象名都是自己起的（file/ + 文件 ID），没有要转义的字符，正则就够
      let last = '';
      for (const m of xml.matchAll(/<Contents>[\s\S]*?<Key>([^<]+)<\/Key>[\s\S]*?<LastModified>([^<]+)<\/LastModified>[\s\S]*?<\/Contents>/g)) {
        out.push({ id: m[1].slice(PREFIX.length), modifiedAt: Date.parse(m[2]) });
        last = m[1];
      }
      // 一次最多回 1000 个：没列完就从最后一个接着列
      marker = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? xml.match(/<NextMarker>([^<]+)<\/NextMarker>/)?.[1] ?? last : '';
    } while (marker);
    return out;
  }
}
