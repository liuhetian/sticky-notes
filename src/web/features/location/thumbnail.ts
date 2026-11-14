// 位置卡片的缩略图和地名：只在卡片刚建好时做一次，结果存下来，之后显示不再用地图服务。
// 缩略图是把目标点周围的几张地图瓦片拼到一张画布上，中间画一个图钉。
// 唯一依赖的外部数据是 OpenStreetMap（坐标就是 WGS-84，不用换算，也不用申请 key）；
// 由浏览器直接去取——边缘函数所在的节点连不上它
import { fmtCoords, pickPlaceName, tileAt, type LatLng } from '@/shared/geo';
import type { LocationItem } from '@/shared/schema';
import { putFile } from '../../api/client';
import type { Actions } from '../../state/actions';

const ZOOM = 16;
/** 卡片上显示 240×150，按两倍画 */
const W = 480, H = 300;

const TILE = (z: number, x: number, y: number) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
/** Photon：用 OpenStreetMap 数据做的地名查询，允许网页直接调 */
const REVERSE = (p: LatLng) => `https://photon.komoot.io/reverse?lat=${p.lat}&lon=${p.lng}`;

async function loadTile(z: number, x: number, y: number): Promise<ImageBitmap> {
  const res = await fetch(TILE(z, x, y));
  if (!res.ok) throw new Error(`瓦片 ${res.status}`);
  return createImageBitmap(await res.blob());
}

function drawPin(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.ellipse(0, 2, 9, 4, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, .22)';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-22, -24, -17, -50, 0, -50);
  ctx.bezierCurveTo(17, -50, 22, -24, 0, 0);
  ctx.fillStyle = '#e5534b';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -32, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.restore();
}

/** 以 p 为中心的地图缩略图（JPEG） */
export async function renderThumbnail(p: LatLng): Promise<Blob> {
  const t = tileAt(p, ZOOM);
  // 目标点在画布正中：算出画布左上角对应的「全局像素」，再看盖住画布要哪几张瓦片
  const gx = t.x * 256 + t.px - W / 2, gy = t.y * 256 + t.py - H / 2;
  const x0 = Math.floor(gx / 256), x1 = Math.floor((gx + W - 1) / 256);
  const y0 = Math.floor(gy / 256), y1 = Math.floor((gy + H - 1) / 256);
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#eee9dd';
  ctx.fillRect(0, 0, W, H);
  const jobs: Promise<void>[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      if (y < 0 || y >= t.n) continue;
      jobs.push(loadTile(ZOOM, ((x % t.n) + t.n) % t.n, y).then((bmp) => ctx.drawImage(bmp, x * 256 - gx, y * 256 - gy)));
    }
  }
  await Promise.all(jobs);
  drawPin(ctx, W / 2, H / 2);
  // 地图数据的署名，OpenStreetMap 要求带上
  ctx.font = '16px sans-serif';
  const label = '© OpenStreetMap';
  const lw = ctx.measureText(label).width;
  ctx.fillStyle = 'rgba(255, 255, 255, .75)';
  ctx.fillRect(W - lw - 12, H - 24, lw + 12, 24);
  ctx.fillStyle = '#555';
  ctx.fillText(label, W - lw - 6, H - 7);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('导出失败'))), 'image/jpeg', 0.86));
}

export async function placeName(p: LatLng): Promise<string> {
  const res = await fetch(REVERSE(p));
  if (!res.ok) throw new Error(`地名 ${res.status}`);
  const data = (await res.json()) as { features?: { properties?: Record<string, string> }[] };
  return pickPlaceName(data.features?.[0]?.properties ?? {});
}

// 每张卡片在一次页面打开期间只试一次：地图服务不通时不反复重试，卡片照常用
const tried = new Set<string>();

/** 给还没有缩略图的位置卡片补上缩略图和地名；哪一步失败就少哪一样 */
export async function enrichLocation(actions: Actions, boardId: string, item: LocationItem) {
  if (item.thumb || item.rev === 0 || tried.has(item.id)) return;
  tried.add(item.id);
  const [name, blob] = await Promise.all([
    item.name ? Promise.resolve('') : placeName(item).catch(() => ''),
    renderThumbnail(item).catch(() => null),
  ]);
  let thumb;
  if (blob) {
    const file = `map-${fmtCoords(item)}.jpg`;
    thumb = await putFile(blob).then((id) => ({ id, name: file, size: blob.size, mime: 'image/jpeg' }), () => undefined);
  }
  if (!name && !thumb) return;
  await actions.patch(boardId, item, { ...(name ? { name } : {}), ...(thumb ? { thumb } : {}) }, { record: false });
}
