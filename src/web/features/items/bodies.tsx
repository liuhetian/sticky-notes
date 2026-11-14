// 各类型卡片的正文：图片、文件、位置，以及两种「还在传」的占位
import { useEffect, useRef, useState } from 'react';
import { fmtCoords, mapUrl } from '@/shared/geo';
import type { FileLikeItem, LocationItem } from '@/shared/schema';
import { download, isApplePhone } from '../../lib/clipboard';
import { extClass, extLabel, fmtSize } from '../../lib/format';
import { lightboxStore } from '../../state/stores';
import { Icon } from '../../ui/Icon';
import { previewKind } from '@/shared/constants';
import { AudioBody, DocBody, VideoBody } from '../preview/bodies';
import { FileImage } from './FileImage';

export function ImageBody({ item }: { item: FileLikeItem }) {
  return (
    <>
      <div className="photo">
        <FileImage file={item.file} loading="lazy" draggable={false} onDoubleClick={() => lightboxStore.set(item.file)} />
      </div>
      <div className="caption"><span className="fname" title={item.file.name}>{item.file.name}</span><span className="fsize">{fmtSize(item.file.size)}</span></div>
    </>
  );
}

/** 音视频直接播放、文档显示第一页；其余的（以及放不了的）是一张带下载按钮的文件卡片 */
export function FileBody({ item }: { item: FileLikeItem }) {
  const plain = <PlainFile item={item} />;
  const kind = previewKind(item.file.name);
  if (kind === 'video') return <VideoBody item={item} fallback={plain} />;
  if (kind === 'audio') return <AudioBody item={item} fallback={plain} />;
  if (kind === 'doc') return <DocBody item={item} fallback={plain} />;
  return plain;
}

function PlainFile({ item }: { item: FileLikeItem }) {
  return (
    <div className="filecard">
      <div className={`ext ${extClass(item.file.name)}`}>{extLabel(item.file.name)}</div>
      <div className="fmeta"><div className="fname" title={item.file.name}>{item.file.name}</div><div className="fsize">{fmtSize(item.file.size)}</div></div>
      <button type="button" className="dl" onClick={(e) => { e.stopPropagation(); download(item.file); }}><Icon name="download" />下载</button>
    </div>
  );
}

/** 手机快捷指令发来、文件还没到 */
export function PendingBody({ item }: { item: FileLikeItem }) {
  return (
    <div className="pending">
      <div className="spinner" />
      <div className="fname" title={item.file.name}>{item.file.name}</div>
      <div className="fsize">手机那边正在传……</div>
    </div>
  );
}

/** 本机正在上传：传完换成正式卡片，失败就消失 */
export function UploadingCard({ x, y, name, progress }: { x: number; y: number; name: string; progress: number }) {
  return (
    <div className="item uploading" style={{ left: x, top: y, order: -2147483000 }}>
      <div className="up-name">{name}</div>
      <div className="progress"><i style={{ width: `${progress * 100}%` }} /></div>
      <div className="up-pct">{progress ? `${Math.round(progress * 100)}%` : '准备上传…'}</div>
    </div>
  );
}

export const openInMap = (item: LocationItem) => window.open(mapUrl(item, item.name, isApplePhone()), '_blank', 'noopener');

/** 位置：地图缩略图（创建时生成一次存下来的图片）+ 地名 + 坐标；点地图跳到地图 App 或网页 */
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
