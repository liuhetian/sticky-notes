// 上传：Uppy 无界面模式。签名时向 /api/uploads 领预签名 PUT 地址，文件直接进 Blob，传完再建卡片
import Uppy, { type UppyFile } from '@uppy/core';
import AwsS3 from '@uppy/aws-s3';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { MAX_FILE } from '@/shared/constants';
import type { Item } from '@/shared/schema';
import { api, unwrap } from '../../api/client';
import { fixName, isInlineImage } from '../../lib/format';

type Meta = { boardId: string; x: number; y: number; ttl: number | null };
export type Uploading = { id: string; boardId: string; x: number; y: number; name: string; progress: number };

let uploading: Uploading[] = [];
const subs = new Set<() => void>();
const setUploading = (fn: (u: Uploading[]) => Uploading[]) => { uploading = fn(uploading); subs.forEach((f) => f()); };
export const useUploading = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => uploading);

export function useUploader(onDone: (boardId: string, file: { id: string; name: string; size: number; mime: string }, meta: Meta) => Promise<Item | null>) {
  const uppy = useMemo(() => {
    const u = new Uppy<Meta, Record<string, never>>({ autoProceed: true, restrictions: { maxFileSize: MAX_FILE } });
    u.use(AwsS3, {
      shouldUseMultipart: false,
      generateObjectKey: (file) => file.id, // 签名时拿它找回文件
      signRequest: async (req) => {
        if (req.method !== 'PUT' || 'uploadId' in req) throw new Error('不支持分片上传');
        const file = u.getFile(req.key);
        const r = await unwrap<{ id: string; url: string }>(api.uploads.$post({ json: { name: file.name!, size: file.size!, mime: file.type } }));
        return { url: r.url, key: r.id };
      },
    });
    return u;
  }, []);

  useEffect(() => {
    const progress = (file: UppyFile<Meta, Record<string, never>> | undefined, p: { bytesUploaded: number | false; bytesTotal: number | null }) => {
      if (!file || !p.bytesTotal || p.bytesUploaded === false) return;
      const ratio = p.bytesUploaded / p.bytesTotal;
      setUploading((list) => list.map((x) => (x.id === file.id ? { ...x, progress: ratio } : x)));
    };
    const success = async (file: UppyFile<Meta, Record<string, never>> | undefined, res: { body?: unknown }) => {
      if (!file) return;
      const key = (res.body as { key?: string } | undefined)?.key;
      if (key) await onDone(file.meta.boardId, { id: key, name: file.name!, size: file.size!, mime: file.type }, file.meta);
      setUploading((list) => list.filter((x) => x.id !== file.id));
      uppy.removeFile(file.id);
    };
    const failed = (file: UppyFile<Meta, Record<string, never>> | undefined, err: { message: string }) => {
      if (!file) return;
      toast.error(`「${file.name}」上传失败：${err.message}`);
      setUploading((list) => list.filter((x) => x.id !== file.id));
      uppy.removeFile(file.id);
    };
    uppy.on('upload-progress', progress);
    uppy.on('upload-success', success);
    uppy.on('upload-error', failed);
    return () => {
      uppy.off('upload-progress', progress);
      uppy.off('upload-success', success);
      uppy.off('upload-error', failed);
    };
  }, [uppy, onDone]);

  return (files: File[], meta: Meta) => {
    files.forEach((file, i) => {
      if (file.size === 0) return toast.error(`「${file.name}」是空文件`);
      const name = fixName(file);
      const m = { ...meta, x: meta.x + i * 30, y: meta.y + i * 30 };
      try {
        const id = uppy.addFile({ name, type: file.type, data: file, meta: m, source: 'local' });
        setUploading((list) => [...list, { id, boardId: m.boardId, x: m.x, y: m.y, name, progress: 0 }]);
      } catch (e) {
        toast.error(`「${name}」传不了：${e instanceof Error ? e.message.replace(/This file exceeds maximum allowed size of/, '超过上限') : e}`);
      }
    });
  };
}

export const kindForUpload = (name: string, mime: string) => (mime.startsWith('image/') && isInlineImage(name) ? 'image' : 'file') as 'image' | 'file';
