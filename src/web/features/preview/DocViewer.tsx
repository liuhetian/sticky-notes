// 翻看文档：直接嵌 COS 自带的在线阅读器（翻页、缩放、目录都是它的），这里只有外框和下载、关闭
import { docStore } from '../../state/stores';
import { FileViewer } from '../dialogs/FileViewer';
import { viewerUrl } from './doc';

export function DocViewer() {
  return (
    <FileViewer file={docStore.use()} onClose={() => docStore.set(null)} className="doc-viewer" frame>
      {(f) => <iframe key={f.id} className="doc-frame" src={viewerUrl(f)} title={f.name} allow="fullscreen" />}
    </FileViewer>
  );
}
