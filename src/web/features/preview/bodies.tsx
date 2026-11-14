// 能直接播放或预览的文件卡片：视频、音频、文档。放不了、出不了封面时退回普通文件卡片
import { useEffect, useState, type ReactNode } from 'react';
import type { FileLikeItem } from '@/shared/schema';
import { fileUrl } from '../../api/client';
import { extClass, extLabel, fmtSize } from '../../lib/format';
import { docStore } from '../../state/stores';
import { docCover, type Cover } from './doc';

const Caption = ({ item, extra }: { item: FileLikeItem; extra?: string }) => (
  <div className="caption"><span className="fname" title={item.file.name}>{item.file.name}</span><span className="fsize">{extra ? `${extra} · ` : ''}{fmtSize(item.file.size)}</span></div>
);

export function VideoBody({ item, fallback }: { item: FileLikeItem; fallback: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (failed) return fallback;
  return (
    <>
      <div className="photo media">
        {/* 只先取时长和第一帧，点了播放才下载内容 */}
        <video src={fileUrl(item.file)} controls playsInline preload="metadata" onError={() => setFailed(true)} />
      </div>
      <Caption item={item} />
    </>
  );
}

export function AudioBody({ item, fallback }: { item: FileLikeItem; fallback: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (failed) return fallback;
  return (
    <div className="filecard">
      <div className={`ext ${extClass(item.file.name)}`}>{extLabel(item.file.name)}</div>
      <div className="fmeta"><div className="fname" title={item.file.name}>{item.file.name}</div><div className="fsize">{fmtSize(item.file.size)}</div></div>
      <audio className="player" src={fileUrl(item.file)} controls preload="none" onError={() => setFailed(true)} />
    </div>
  );
}

export function DocBody({ item, fallback }: { item: FileLikeItem; fallback: ReactNode }) {
  const [cover, setCover] = useState<Cover | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    void docCover(item.file).then((c) => alive && setCover(c));
    return () => { alive = false; };
  }, [item.file.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (failed) return fallback;
  return (
    <>
      <div className="photo doc-cover" title="双击翻看" onDoubleClick={() => docStore.set(item.file)}>
        {cover ? <img src={cover.url} alt={item.file.name} draggable={false} onError={() => setFailed(true)} /> : <div className="spinner" />}
      </div>
      <Caption item={item} extra={cover?.pages ? `${cover.pages} 页` : undefined} />
    </>
  );
}
