// 腾讯云 COS 的请求签名（XML API，HMAC-SHA1）。只用 Web Crypto 和字符串拼接：
// 边缘运行时的 URL / URLSearchParams 不全，现成的签名库（aws4fetch）在上面跑不起来
const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hmacSha1(key: string, msg: string) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
const sha1 = async (msg: string) => hex(await crypto.subtle.digest('SHA-1', enc.encode(msg)));

/** COS 要的 URL 编码：比 encodeURIComponent 多转 ! ' ( ) * */
export const cosEncode = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export type SignInput = {
  secretId: string;
  secretKey: string;
  method: string;
  /** 对象路径，以 / 开头，不带查询串 */
  path: string;
  /** 参与签名的查询参数（改了就验不过） */
  query?: Record<string, string>;
  /** 从哪一秒开始有效、有效多少秒 */
  start: number;
  expires: number;
};

/**
 * 返回「查询串」和「签名串」。请求时两种用法：
 *   放请求头：Authorization: <auth>，URL 用 path?query
 *   预签名地址：path?query&auth，谁拿到这个地址谁就能在有效期内访问
 */
export async function cosSign(o: SignInput): Promise<{ query: string; auth: string }> {
  const keyTime = `${o.start};${o.start + o.expires}`;
  const pairs = Object.entries(o.query ?? {})
    .map(([k, v]) => ({ lower: cosEncode(k).toLowerCase(), key: cosEncode(k), value: cosEncode(v) }))
    .sort((a, b) => (a.lower < b.lower ? -1 : a.lower > b.lower ? 1 : 0));
  const httpString = `${o.method.toLowerCase()}\n${o.path}\n${pairs.map((p) => `${p.lower}=${p.value}`).join('&')}\n\n`;
  const signKey = await hmacSha1(o.secretKey, keyTime);
  const signature = await hmacSha1(signKey, `sha1\n${keyTime}\n${await sha1(httpString)}\n`);
  const auth = [
    'q-sign-algorithm=sha1', `q-ak=${o.secretId}`, `q-sign-time=${keyTime}`, `q-key-time=${keyTime}`,
    'q-header-list=', `q-url-param-list=${pairs.map((p) => p.lower).join(';')}`, `q-signature=${signature}`,
  ].join('&');
  return { query: pairs.map((p) => `${p.key}=${p.value}`).join('&'), auth };
}
