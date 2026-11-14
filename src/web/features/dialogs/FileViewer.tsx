// 看文件的全屏弹层：看大图、翻看文档共用的外框（深色遮罩、一条「名字 · 大小」和下载）
import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import type { FileRef } from '@/shared/schema';
import { downloadUrl } from '../../api/client';
import { fmtSize } from '../../lib/format';
import { Icon } from '../../ui/Icon';

export function FileViewer({ file, onClose, className, frame, children }: {
  file: FileRef | null;
  onClose: () => void;
  className: string;
  /** 内容是 iframe（文档阅读器）：点不到外面关，那一条放在上面、多一个「关闭」；否则点哪里都关 */
  frame?: boolean;
  children: (f: FileRef) => ReactNode;
}) {
  const bar = (f: FileRef) => (
    <div className="lb-bar">
      <span>{f.name} · {fmtSize(f.size)}</span>
      <a className="btn" href={downloadUrl(f)} download={f.name} onClick={(e) => e.stopPropagation()}><Icon name="download" />下载</a>
      {frame && <Dialog.Close className="btn"><Icon name="x" />关闭</Dialog.Close>}
    </div>
  );
  return (
    <Dialog.Root open={!!file} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay dark" />
        <Dialog.Content className={className} aria-describedby={undefined} onClick={frame ? undefined : onClose}>
          <Dialog.Title className="sr-only">{file?.name}</Dialog.Title>
          {file && (frame ? <>{bar(file)}{children(file)}</> : <>{children(file)}{bar(file)}</>)}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
