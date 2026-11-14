// 看大图
import * as Dialog from '@radix-ui/react-dialog';
import { fileUrl } from '../../api/client';
import { fmtSize } from '../../lib/format';
import { lightboxStore } from '../../state/stores';
import { Icon } from '../../ui/Icon';
import { FileImage } from '../items/FileImage';

export function Lightbox() {
  const f = lightboxStore.use();
  const close = () => lightboxStore.set(null);
  return (
    <Dialog.Root open={!!f} onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay dark" />
        <Dialog.Content className="lightbox" aria-describedby={undefined} onClick={close}>
          <Dialog.Title className="sr-only">{f?.name}</Dialog.Title>
          {f && <FileImage key={f.id} file={f} />}
          {f && (
            <div className="lb-bar">
              <span>{f.name} · {fmtSize(f.size)}</span>
              <a className="btn" href={`${fileUrl(f)}?dl=1`} download={f.name} onClick={(e) => e.stopPropagation()}><Icon name="download" />下载</a>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
