// 显示上传的图片。iPhone 照片是 HEIC：Safari 能直接显示，其他浏览器显示失败时按需加载 heic2any 转成 JPEG
import { useState, type ImgHTMLAttributes } from 'react';
import type { FileRef } from '@/shared/schema';
import { apiFetch, fileUrl, rawUrl } from '../../api/client';

type FileKey = Pick<FileRef, 'id' | 'name'>;
const converted = new Map<string, Promise<string>>();
const isHeic = (name: string) => /\.(heic|heif)$/i.test(name);

/** 能读出像素的地址（画图垫底、复制图片用）：HEIC 转好的 blob 地址，或由本站转发的原图 */
export function readableUrl(file: FileKey): Promise<string> {
  return converted.get(file.id) ?? Promise.resolve(rawUrl(file));
}

function convertHeic(file: FileKey) {
  let p = converted.get(file.id);
  if (!p) {
    p = (async () => {
      const { default: heic2any } = await import('heic2any');
      const blob = await (await apiFetch(rawUrl(file))).blob();
      const out = await heic2any({ blob, toType: 'image/jpeg', quality: 0.85 });
      return URL.createObjectURL(Array.isArray(out) ? out[0] : out);
    })();
    converted.set(file.id, p);
    p.catch(() => converted.delete(file.id));
  }
  return p;
}

/** 显示不了时（HEIC 也转不成）：调用方给了 onError 就交给它，否则显示一句说明 */
export function FileImage({ file, onError, ...props }: { file: FileKey; onError?: () => void } & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'>) {
  const [src, setSrc] = useState(fileUrl(file));
  const [failed, setFailed] = useState(false);
  const fail = () => (onError ? onError() : setFailed(true));
  if (failed) return <div className="img-failed">{file.name}<br />这个浏览器显示不了，下载看吧</div>;
  return (
    <img {...props} src={src} alt={props.alt ?? file.name} onError={() => {
      if (!isHeic(file.name) || src.startsWith('blob:')) return fail();
      convertHeic(file).then(setSrc, fail);
    }} />
  );
}
