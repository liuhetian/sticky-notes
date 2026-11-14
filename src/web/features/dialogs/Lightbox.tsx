// 看大图：点哪里都关
import { lightboxStore } from '../../state/stores';
import { FileImage } from '../items/FileImage';
import { FileViewer } from './FileViewer';

export function Lightbox() {
  return (
    <FileViewer file={lightboxStore.use()} onClose={() => lightboxStore.set(null)} className="lightbox">
      {(f) => <FileImage key={f.id} file={f} />}
    </FileViewer>
  );
}
