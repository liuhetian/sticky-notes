// 本机正在上传：先显示一张带进度的占位卡片，传完换成正式卡片，失败就消失
import type { Uploading } from '../upload/useUploader';

export function UploadingCard({ x, y, name, progress }: Uploading) {
  return (
    // 手机上排成一列时排在最前面
    <div className="item uploading" style={{ left: x, top: y, order: -2147483000 }}>
      <div className="up-name">{name}</div>
      <div className="progress"><i style={{ width: `${progress * 100}%` }} /></div>
      <div className="up-pct">{progress ? `${Math.round(progress * 100)}%` : '准备上传…'}</div>
    </div>
  );
}
