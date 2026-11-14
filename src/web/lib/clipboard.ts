// 复制文字、复制图片、触发下载
import { toast } from 'sonner';
import { fileUrl } from '../api/client';

export async function copyText(text: string, done = '已复制') {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
  } catch {
    toast.error(`浏览器不让复制：${text.length > 80 ? '点编辑后手动选吧' : text}`);
  }
}

/** src 要是本站能读内容的地址（rawUrl 或 blob:）；剪贴板只收 PNG，别的格式先转一下 */
export async function copyImage(src: Promise<string>) {
  const png = (async () => {
    const blob = await (await fetch(await src)).blob();
    if (blob.type === 'image/png') return blob;
    const bmp = await createImageBitmap(blob);
    const c = Object.assign(document.createElement('canvas'), { width: bmp.width, height: bmp.height });
    c.getContext('2d')!.drawImage(bmp, 0, 0);
    return new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
  })();
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    toast('图片已复制');
  } catch {
    toast.error('这个浏览器不支持复制图片，下载吧');
  }
}

export function download(file: { id: string; name: string }) {
  const a = Object.assign(document.createElement('a'), { href: `${fileUrl(file)}?dl=1`, download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
}

/** 手机上调系统的分享面板，电脑上复制到剪贴板 */
export async function shareLink(url: string, mobile: boolean) {
  if (mobile && navigator.share) { try { await navigator.share({ url }); } catch { /* 取消了 */ } return; }
  await copyText(url, '分享链接已复制');
}

export const isApplePhone = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
