// 翻看文档：直接嵌 COS 自带的在线阅读器（翻页、缩放、目录都是它的），这里只有外框和下载、关闭
import * as Dialog from '@radix-ui/react-dialog';
import { fileUrl } from '../../api/client';
import { fmtSize } from '../../lib/format';
import { docStore } from '../../state/stores';
import { Icon } from '../../ui/Icon';
import { viewerUrl } from './doc';

export function DocViewer() {
  const f = docStore.use();
  return (
    <Dialog.Root open={!!f} onOpenChange={(o) => !o && docStore.set(null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay dark" />
        <Dialog.Content className="doc-viewer" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">{f?.name}</Dialog.Title>
          {f && (
            <>
              <div className="lb-bar">
                <span>{f.name} · {fmtSize(f.size)}</span>
                <a className="btn" href={`${fileUrl(f)}?dl=1`} download={f.name}><Icon name="download" />下载</a>
                <Dialog.Close className="btn"><Icon name="x" />关闭</Dialog.Close>
              </div>
              <iframe key={f.id} className="doc-frame" src={viewerUrl(f)} title={f.name} allow="fullscreen" />
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
