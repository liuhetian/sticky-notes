// 新建：便利贴（先出一张草稿）、画布、文件、位置；粘贴和拖进来的东西也走这里。
// 新东西一律放进看得见的地方（usePlacing）
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import { BOARD_FULL, BOARD_MAX, FAULTS, TRASH } from '@/shared/constants';
import { parseCoords, round6 } from '@/shared/geo';
import { sizeOf, type Size } from '@/shared/layout';
import type { Item, NoteItem } from '@/shared/schema';
import type { Actions } from '../../state/actions';
import { qk } from '../../state/queries';
import { colorStore, sketchStore, ttlStore } from '../../state/stores';
import type { UploadMeta } from '../upload/useUploader';
import type { CreateHandlers } from './CreateMenu';
import type { Pos } from './geometry';
import type { usePlacing } from './usePlacing';

export const IMAGE = sizeOf({ type: 'image' });
const LOCATION = sizeOf({ type: 'location' });

export function useCreate(boardId: string, actions: Actions, place: ReturnType<typeof usePlacing>, upload: (files: File[], meta: UploadMeta) => void) {
  const ttl = ttlStore.use();
  const qc = useQueryClient();
  /** 双击或菜单新建的便利贴：先在本地写，存的时候才真正创建 */
  const [draft, setDraft] = useState<Pos | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const filePos = useRef<Pos | null>(null);

  const createNote = (text: string, pos: Pos, color: NoteItem['color'] = colorStore.get()) =>
    actions.create(boardId, { type: 'note', text, color, x: pos.x, y: pos.y, ttl });
  const createLocation = (lat: number, lng: number, pos: Pos) =>
    actions.create(boardId, { type: 'location', lat: round6(lat), lng: round6(lng), x: pos.x, y: pos.y, ttl });
  const uploadAt = (files: File[], pos: Pos) => { if (files.length && !blocked(files.length)) upload(files, { boardId, ...pos, ttl }); };

  /**
   * 废纸篓、故障白板里不能新建（废纸篓里菜单和加号本来就没有，要拦的是双击、粘贴和拖放）。
   * 白板放不下 n 个了也先在本机拦一下，免得文件白传一趟；准不准以服务端为准
   */
  const blocked = (n = 1) => {
    if (boardId === TRASH) { toast('废纸篓里不能直接贴，先切到别的白板'); return true; }
    if (boardId === FAULTS) { toast('故障白板只放页面自动上报的失败记录，先切到别的白板'); return true; }
    if ((qc.getQueryData<Item[]>(qk.items(boardId))?.length ?? 0) + n > BOARD_MAX) { toast.error(BOARD_FULL); return true; }
    return false;
  };

  const startDraft = (pos?: Pos) => { if (!blocked()) setDraft(pos ? place.fit(pos) : place.center()); };
  const pickFiles = (pos?: Pos) => {
    if (blocked()) return;
    filePos.current = pos ? place.fit(pos, IMAGE) : null;
    fileInput.current?.click();
  };
  const startSketch = (pos?: Pos) => !blocked() && sketchStore.set({ at: Date.now(), pos: pos ? place.fit(pos, IMAGE) : place.center(IMAGE) });
  /** 取这台设备的当前位置，建一张位置卡片 */
  const startLocation = (pos?: Pos) => {
    if (blocked()) return;
    if (!navigator.geolocation) { toast.error('这个浏览器取不到位置，可以直接粘贴「纬度,经度」'); return; }
    const at = pos ? place.fit(pos, LOCATION) : place.center(LOCATION);
    const tid = toast.loading('正在取当前位置…');
    navigator.geolocation.getCurrentPosition(
      (g) => { toast.dismiss(tid); createLocation(g.coords.latitude, g.coords.longitude, at); },
      (err) => { toast.dismiss(tid); toast.error(err.code === err.PERMISSION_DENIED ? '没有定位权限：在浏览器里允许后再试，或者直接粘贴「纬度,经度」' : '取不到当前位置，可以直接粘贴「纬度,经度」'); },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  /** 创建菜单的四项；pos 给了就放在那（右键点的地方），否则放视口中间 */
  const menu = (pos?: () => Pos): CreateHandlers => ({
    onNote: () => startDraft(pos?.()), onSketch: () => startSketch(pos?.()), onFile: () => pickFiles(pos?.()), onLocation: () => startLocation(pos?.()),
  });

  /**
   * 粘贴或拖进来的东西：有文件就上传；一对「纬度,经度」变位置卡片；其余文字变便利贴。
   * at 按卡片大小给出放哪。没有能用的东西返回 false
   */
  const ingest = (data: DataTransfer, at: (size: Size) => Pos): boolean => {
    const files = [...data.files];
    const text = data.getData('text/plain');
    if (!files.length && !text.trim()) return false;
    if (blocked()) return true;
    if (files.length) uploadAt(files, at(IMAGE));
    else {
      const spot = parseCoords(text);
      if (spot) createLocation(spot.lat, spot.lng, at(LOCATION));
      else createNote(text, at(sizeOf({ type: 'note', text })));
    }
    return true;
  };

  /** 隐藏的选文件框：选好就传 */
  const fileInputProps = {
    ref: fileInput, type: 'file', multiple: true, hidden: true,
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      uploadAt([...(e.target.files ?? [])], filePos.current ?? place.center(IMAGE));
      e.target.value = '';
    },
  };

  return { ttl, draft, setDraft, createNote, uploadAt, startDraft, menu, ingest, fileInputProps };
}
