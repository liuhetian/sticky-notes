// 上传：Uppy 无界面模式。签名时向 /api/uploads 领预签名 PUT 地址，文件直接进 COS，传完再建卡片
import Uppy, { type UppyFile } from '@uppy/core';
import AwsS3 from '@uppy/aws-s3';
import { useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { MAX_FILE } from '@/shared/constants';
import type { FileRef, Item } from '@/shared/schema';
import { api, unwrap } from '../../api/client';
import { fixName } from '../../lib/format';
import { createStore } from '../../state/stores';

export type UploadMeta = { boardId: string; x: number; y: number; ttl: number | null };
export type Uploading = { id: string; boardId: string; x: number; y: number; name: string; progress: number };
type File_ = UppyFile<UploadMeta, Record<string, never>>;

/** 正在传的文件：白板上先显示带进度的占位卡片 */
const uploadingStore = createStore<Uploading[]>([]);
const setUploading = (fn: (u: Uploading[]) => Uploading[]) => uploadingStore.set(fn(uploadingStore.get()));
export const useUploading = uploadingStore.use;

export function useUploader(onDone: (boardId: string, file: FileRef, meta: UploadMeta) => Promise<Item | null>) {
  const uppy = useMemo(() => {
    const u = new Uppy<UploadMeta, Record<string, never>>({
      autoProceed: true,
      restrictions: { maxFileSize: MAX_FILE, minFileSize: 1 },
      locale: { strings: { exceedsSize: '超过 %{size} 的上限', inferiorSize: '是空文件' }, pluralize: () => 0 },
    });
    u.use(AwsS3, {
      shouldUseMultipart: false,
      generateObjectKey: (file) => file.id, // 签名时拿它找回文件
      signRequest: async (req) => {
        if (req.method !== 'PUT' || 'uploadId' in req) throw new Error('不支持分片上传');
        const r = await unwrap<{ id: string; url: string }>(api.uploads.$post({ json: { size: u.getFile(req.key).size! } }));
        return { url: r.url, key: r.id };
      },
    });
    return u;
  }, []);

  useEffect(() => {
    const finish = (file: File_) => {
      setUploading((list) => list.filter((x) => x.id !== file.id));
      uppy.removeFile(file.id);
    };
    const progress = (file: File_ | undefined, p: { bytesUploaded: number | false; bytesTotal: number | null }) => {
      if (!file || !p.bytesTotal || p.bytesUploaded === false) return;
      const ratio = p.bytesUploaded / p.bytesTotal;
      setUploading((list) => list.map((x) => (x.id === file.id ? { ...x, progress: ratio } : x)));
    };
    const success = async (file: File_ | undefined, res: { body?: unknown }) => {
      if (!file) return;
      const key = (res.body as { key?: string } | undefined)?.key;
      if (key) await onDone(file.meta.boardId, { id: key, name: file.name!, size: file.size!, mime: file.type }, file.meta);
      finish(file);
    };
    const failed = (file: File_ | undefined, err: { message: string }) => {
      if (!file) return;
      toast.error(`「${file.name}」上传失败：${err.message}`);
      finish(file);
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

  return (files: File[], meta: UploadMeta) => {
    files.forEach((file, i) => {
      const name = fixName(file);
      const m = { ...meta, x: meta.x + i * 30, y: meta.y + i * 30 };
      try {
        const id = uppy.addFile({ name, type: file.type, data: file, meta: m, source: 'local' });
        setUploading((list) => [...list, { id, boardId: m.boardId, x: m.x, y: m.y, name, progress: 0 }]);
      } catch (e) {
        // 大小不对（超过上限、空文件）：Uppy 按上面的 locale 给中文说明
        toast.error(`「${name}」传不了：${e instanceof Error ? e.message : e}`);
      }
    });
  };
}
