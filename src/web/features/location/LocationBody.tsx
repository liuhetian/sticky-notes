// 位置卡片的正文：地图缩略图（创建时生成一次存下来的图片）+ 地名 + 坐标；点地图跳到地图 App 或网页
import { useEffect, useRef, useState } from 'react';
import { fmtCoords, mapUrl } from '@/shared/geo';
import type { LocationItem } from '@/shared/schema';
import { isApplePhone } from '../../lib/clipboard';
import { Icon } from '../../ui/Icon';
import { FileImage } from '../items/FileImage';

export const openInMap = (item: LocationItem) => window.open(mapUrl(item, item.name, isApplePhone()), '_blank', 'noopener');

export function LocationBody({ item, renaming, onStartRename, onRename, wasDragged }: {
  item: LocationItem;
  renaming: boolean;
  onStartRename: () => void;
  /** null 是取消 */
  onRename: (name: string | null) => void;
  /** 刚拖过卡片：松手时的那一下点击不算「打开地图」 */
  wasDragged: () => boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [failed, setFailed] = useState(false);
  // 一次改名只交一次结果：按 Esc 取消后输入框失焦，不能再当成确认
  const settled = useRef(false);
  const finish = (name: string | null) => { if (settled.current) return; settled.current = true; onRename(name); };
  useEffect(() => { if (renaming) { settled.current = false; input.current?.select(); } }, [renaming]);
  return (
    <>
      <div className="loc-map" title="在地图中打开" onClick={() => { if (!wasDragged()) openInMap(item); }}>
        {item.thumb && !failed
          ? <FileImage file={item.thumb} draggable={false} loading="lazy" onError={() => setFailed(true)} />
          : <div className="loc-blank"><Icon name="pin" /><span>{item.rev === 0 || !item.thumb ? '点一下在地图中打开' : '缩略图没了，点一下在地图中打开'}</span></div>}
      </div>
      {renaming ? (
        <input ref={input} className="loc-input" defaultValue={item.name} maxLength={80} placeholder="给这个位置起个名字"
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') { e.preventDefault(); finish(null); }
          }}
          onBlur={(e) => finish(e.currentTarget.value.trim())} />
      ) : (
        <div className="loc-name" title="双击改名" onDoubleClick={onStartRename}>{item.name || '未命名的位置'}</div>
      )}
      <div className="loc-coords">{fmtCoords(item)}</div>
    </>
  );
}
