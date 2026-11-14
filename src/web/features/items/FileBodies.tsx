// 图片、文件卡片的正文。音视频直接播放、文档显示第一页；放不了、出不了封面的退回普通文件卡片（带下载按钮）
import { useEffect, useState } from 'react';
import { previewKind } from '@/shared/constants';
import type { FileLikeItem } from '@/shared/schema';
import { fileUrl } from '../../api/client';
import { download } from '../../lib/clipboard';
import { extClass, extLabel, fmtSize } from '../../lib/format';
import { docStore, lightboxStore } from '../../state/stores';
import { Icon } from '../../ui/Icon';
import { docCover, type Cover } from '../preview/doc';
import { FileImage } from './FileImage';

export function FileLikeBody({ item }: { item: FileLikeItem }) {
  if (item.pending) return <PendingBody item={item} />;
  if (item.type === 'image') return <ImageBody item={item} />;
  const kind = previewKind(item.file.name);
  if (kind === 'video') return <VideoBody item={item} />;
  if (kind === 'audio') return <AudioBody item={item} />;
  if (kind === 'doc') return <DocBody item={item} />;
  return <PlainFile item={item} />;
}

/** 图片、视频、文档封面下面那一行：文件名和大小 */
const Caption = ({ item, extra }: { item: FileLikeItem; extra?: string }) => (
  <div className="caption"><span className="fname" title={item.file.name}>{item.file.name}</span><span className="fsize">{extra ? `${extra} · ` : ''}{fmtSize(item.file.size)}</span></div>
);
/** 文件卡片左边的扩展名块和右边的文件名、大小 */
const FileMeta = ({ item }: { item: FileLikeItem }) => (
  <>
    <div className={`ext ${extClass(item.file.name)}`}>{extLabel(item.file.name)}</div>
    <div className="fmeta"><div className="fname" title={item.file.name}>{item.file.name}</div><div className="fsize">{fmtSize(item.file.size)}</div></div>
  </>
);

function ImageBody({ item }: { item: FileLikeItem }) {
  return (
    <>
      <div className="photo">
        <FileImage file={item.file} loading="lazy" draggable={false} onDoubleClick={() => lightboxStore.set(item.file)} />
      </div>
      <Caption item={item} />
    </>
  );
}

function PlainFile({ item }: { item: FileLikeItem }) {
  return (
    <div className="filecard">
      <FileMeta item={item} />
      <button type="button" className="dl" onClick={(e) => { e.stopPropagation(); download(item.file); }}><Icon name="download" />下载</button>
    </div>
  );
}

function VideoBody({ item }: { item: FileLikeItem }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <PlainFile item={item} />;
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

function AudioBody({ item }: { item: FileLikeItem }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <PlainFile item={item} />;
  return (
    <div className="filecard">
      <FileMeta item={item} />
      <audio className="player" src={fileUrl(item.file)} controls preload="none" onError={() => setFailed(true)} />
    </div>
  );
}

function DocBody({ item }: { item: FileLikeItem }) {
  const [cover, setCover] = useState<Cover | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    void docCover(item.file).then((c) => alive && setCover(c));
    return () => { alive = false; };
  }, [item.file.id]);
  if (failed) return <PlainFile item={item} />;
  return (
    <>
      <div className="photo doc-cover" title="双击翻看" onDoubleClick={() => docStore.set(item.file)}>
        {cover ? <img src={cover.url} alt={item.file.name} draggable={false} onError={() => setFailed(true)} /> : <div className="spinner" />}
      </div>
      <Caption item={item} extra={cover?.pages ? `${cover.pages} 页` : undefined} />
    </>
  );
}

/** 手机快捷指令发来、文件还没到 */
function PendingBody({ item }: { item: FileLikeItem }) {
  return (
    <div className="pending">
      <div className="spinner" />
      <div className="fname" title={item.file.name}>{item.file.name}</div>
      <div className="fsize">手机那边正在传……</div>
    </div>
  );
}
