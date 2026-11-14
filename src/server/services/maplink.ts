// 地图 App 分享出来的链接指向哪个位置：苹果地图的链接自带坐标；高德的是短链，要跟一次跳转
import { isAmapShortLink, parseAmapTarget, parseAppleMapsUrl, type Place } from '../../shared/geo';

/** 不是地图链接、或者短链解不开（超时、格式变了）都回 null，由调用方照普通链接处理 */
export async function placeOfLink(url: string): Promise<Place | null> {
  const apple = parseAppleMapsUrl(url);
  if (apple) return apple;
  if (!isAmapShortLink(url)) return null;
  try {
    // 只要它跳去哪儿，不要页面内容。边缘运行时没有 AbortSignal.timeout，自己掐表
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), 5000);
    const res = await fetch(url, { redirect: 'manual', signal: stop.signal }).finally(() => clearTimeout(timer));
    return parseAmapTarget(res.headers.get('location') ?? '');
  } catch {
    return null;
  }
}
