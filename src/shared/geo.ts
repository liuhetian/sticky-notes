// 位置：坐标一律按 WGS-84（GPS、iPhone 定位用的标准）保存和传递
export type LatLng = { lat: number; lng: number };

const NUM = String.raw`([-+]?\d{1,3}\.\d+)`;
const COORDS = new RegExp(String.raw`^\s*[(（]?\s*${NUM}\s*[,，\s]\s*${NUM}\s*[)）]?\s*$`);

/**
 * 认「39.9,116.4」这样的一对小数：先纬度后经度；第一个数超出纬度范围、反过来才说得通时按「经度,纬度」读。
 * 两个数都要带小数点，免得把普通的「12, 34」当成位置
 */
export function parseCoords(text: string): LatLng | null {
  const m = text.match(COORDS);
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[2]);
  if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return { lat: a, lng: b };
  if (Math.abs(b) <= 90 && Math.abs(a) <= 180) return { lat: b, lng: a };
  return null;
}

export const fmtCoords = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

/** 在地图里打开：苹果设备用自带地图，其余用高德网页（让它按 WGS-84 读坐标，自己换算） */
export function mapUrl(p: LatLng, name: string, apple: boolean): string {
  const q = encodeURIComponent(name || fmtCoords(p));
  return apple
    ? `https://maps.apple.com/?ll=${p.lat},${p.lng}&q=${q}`
    : `https://uri.amap.com/marker?position=${p.lng},${p.lat}&name=${q}&coordinate=wgs84&callnative=0`;
}

/** 经纬度落在第 z 级的哪张瓦片、瓦片里的哪个像素（Web 墨卡托，瓦片 256px） */
export function tileAt(p: LatLng, z: number) {
  const n = 2 ** z;
  const lat = Math.max(-85.0511, Math.min(85.0511, p.lat)) * Math.PI / 180;
  const fx = ((p.lng + 180) / 360) * n;
  const fy = ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n;
  return { x: Math.floor(fx), y: Math.floor(fy), px: (fx % 1) * 256, py: (fy % 1) * 256, n };
}

/** 逆地理结果（Photon 的 properties）里挑一个短地名：有名字的地方用「区 + 名字」，否则用街道 */
export function pickPlaceName(p: Record<string, string | undefined>): string {
  const area = p.district ?? p.county ?? p.city ?? p.state ?? '';
  const spot = p.name ?? p.street ?? p.locality ?? '';
  const name = spot && area && spot !== area ? `${area} ${spot}` : spot || area;
  return name.trim().slice(0, 80);
}

// ── 国内地图 App 分享出来的链接 ──
// 高德的坐标是 GCJ-02（国内地图的偏移标准），存之前换成 WGS-84，免得和 GPS 来的点差几百米

const A = 6378245, EE = 0.00669342162296594323;
function gcjOffset(lat: number, lng: number) {
  const x = lng - 105, y = lat - 35, PI = Math.PI;
  const wave = (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3;
  let dLat = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x)) + wave
    + (20 * Math.sin(y * PI) + 40 * Math.sin(y / 3 * PI)) * 2 / 3 + (160 * Math.sin(y / 12 * PI) + 320 * Math.sin(y * PI / 30)) * 2 / 3;
  let dLng = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x)) + wave
    + (20 * Math.sin(x * PI) + 40 * Math.sin(x / 3 * PI)) * 2 / 3 + (150 * Math.sin(x / 12 * PI) + 300 * Math.sin(x / 30 * PI)) * 2 / 3;
  const rad = lat / 180 * PI, magic = 1 - EE * Math.sin(rad) ** 2, sq = Math.sqrt(magic);
  dLat = (dLat * 180) / ((A * (1 - EE)) / (magic * sq) * PI);
  dLng = (dLng * 180) / (A / sq * Math.cos(rad) * PI);
  return { dLat, dLng };
}
// 偏移只在中国大陆有。用几块矩形粗略圈出来（[北, 西, 南, 东]），再挖掉圈进来的邻国和台湾；
// 只用一个大方框的话，新加坡、日本、韩国都会被当成国内，白白偏出去几百米
const CHINA: [number, number, number, number][] = [
  [49.2204, 79.4462, 42.8899, 96.33], [54.1415, 109.6872, 39.3742, 135.0002], [42.8899, 73.1246, 29.5297, 124.143255],
  [29.5297, 82.9684, 26.7186, 97.0352], [29.5297, 97.0253, 20.414096, 124.367395], [20.414096, 107.975793, 17.871542, 111.744104],
];
const NOT_CHINA: [number, number, number, number][] = [
  [25.398623, 119.921265, 21.785006, 122.497559], [22.284, 101.8652, 20.0988, 106.665], [21.5422, 106.4525, 20.4878, 108.051],
  [55.8175, 109.0323, 50.3257, 119.127], [55.8175, 127.4568, 49.5574, 137.0227], [44.8922, 131.2662, 42.5692, 137.0227],
];
const within = (p: LatLng) => ([n, w, s, e]: [number, number, number, number]) => p.lat <= n && p.lat >= s && p.lng >= w && p.lng <= e;
const inChina = (p: LatLng) => CHINA.some(within(p)) && !NOT_CHINA.some(within(p));

/** GCJ-02 → WGS-84（迭代两次，误差不到 1 米）；国外的点两种标准一样，原样返回 */
export function gcj02ToWgs84(p: LatLng): LatLng {
  if (!inChina(p)) return p;
  let lat = p.lat, lng = p.lng;
  for (let i = 0; i < 2; i++) {
    const d = gcjOffset(lat, lng);
    lat = p.lat - d.dLat; lng = p.lng - d.dLng;
  }
  return { lat, lng };
}

export type Place = LatLng & { name: string };

/** 坐标保留 6 位小数（约 0.1 米），再多没有意义 */
export const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const decode = (s: string) => { try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch { return ''; } };
const validSpot = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/** 高德 App 分享出来的短链：https://surl.amap.com/xxx，要跟一次跳转才知道指向哪儿 */
export const isAmapShortLink = (url: string) => /^https?:\/\/surl\.amap\.com\/[\w-]+$/.test(url);

/**
 * 高德短链跳转到的地址：有地点 id 的是 p=地点id,纬度,经度,名字,地址；地图上随手点的是 q=纬度,经度,名字。
 * 取出来并换成 WGS-84
 */
export function parseAmapTarget(url: string): Place | null {
  const p = url.match(/[?&]p=([^&#]+)/)?.[1], q = url.match(/[?&]q=([^&#]+)/)?.[1];
  const parts = p ? decode(p).split(',').slice(1) : q ? decode(q).split(',') : null;
  if (!parts?.[0] || !parts[1]) return null;
  const lat = Number(parts[0]), lng = Number(parts[1]);
  if (!validSpot(lat, lng)) return null;
  const w = gcj02ToWgs84({ lat, lng });
  return { lat: round6(w.lat), lng: round6(w.lng), name: (parts[2] ?? '').trim().slice(0, 80) };
}

/** 苹果地图的分享链接自带坐标（coordinate= 或 ll=）和名字 */
export function parseAppleMapsUrl(url: string): Place | null {
  if (!/^https?:\/\/maps\.apple\.com\//.test(url)) return null;
  const m = url.match(/[?&](?:coordinate|ll)=([-+]?\d+(?:\.\d+)?)(?:,|%2C)([-+]?\d+(?:\.\d+)?)/i);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  if (!validSpot(lat, lng)) return null;
  return { lat: round6(lat), lng: round6(lng), name: decode(url.match(/[?&](?:name|q)=([^&#]+)/)?.[1] ?? '').trim().slice(0, 80) };
}
