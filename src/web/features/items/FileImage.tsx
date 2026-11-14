// 显示上传的图片。iPhone 照片是 HEIC：Safari 能直接显示，其他浏览器显示失败时按需加载 heic2any 转成 JPEG
import { useState, type ImgHTMLAttributes } from 'react';
import { fileUrl, rawUrl } from '../../api/client';

type FileKey = { id: string; name: string };
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
      const blob = await (await fetch(rawUrl(file))).blob();
      const out = await heic2any({ blob, toType: 'image/jpeg', quality: 0.85 });
      return URL.createObjectURL(Array.isArray(out) ? out[0] : out);
    })();
    converted.set(file.id, p);
    p.catch(() => converted.delete(file.id));
  }
  return p;
}

export function FileImage({ file, ...props }: { file: FileKey } & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'>) {
  const [src, setSrc] = useState(fileUrl(file));
  const [failed, setFailed] = useState(false);
  if (failed) return <div className="img-failed">{file.name}<br />这个浏览器显示不了，下载看吧</div>;
  return (
    <img {...props} src={src} alt={props.alt ?? file.name} onError={() => {
      if (!isHeic(file.name) || src.startsWith('blob:')) return setFailed(true);
      convertHeic(file).then(setSrc, () => setFailed(true));
    }} />
  );
}
