// 画布左下角：当前缩放比例，＋ − 调整，点百分比回到推荐位置（能看全所有内容的比例，最大 100%，对准内容中心）
import { Icon } from '../../ui/Icon';

export function ZoomControl({ scale, onZoom, onReset }: { scale: number; onZoom: (factor: number) => void; onReset: () => void }) {
  return (
    <div className="zoom">
      <button type="button" className="tb-ib" title="缩小（触控板捏合也行）" onClick={() => onZoom(1 / 1.25)}><Icon name="minus" /></button>
      <button type="button" className="zoom-pct" title="回到推荐位置：看全所有内容" onClick={onReset}>{Math.round(scale * 100)}%</button>
      <button type="button" className="tb-ib" title="放大（触控板捏合也行）" onClick={() => onZoom(1.25)}><Icon name="plus" /></button>
    </div>
  );
}
