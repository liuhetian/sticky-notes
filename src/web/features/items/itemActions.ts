// 一张卡片能做的事：右键菜单和卡片工具条（手机上只有它）都从这里取，两边不会对不上。
// 以后加新类型，在 kindActions 里加一段这种类型的专属操作
import { toast } from 'sonner';
import { TRASH, isSystemBoard, previewKind } from '@/shared/constants';
import { fmtCoords } from '@/shared/geo';
import type { Board, Item } from '@/shared/schema';
import { shareUrl } from '../../api/client';
import { copyImage, copyText, download, shareLink } from '../../lib/clipboard';
import type { Actions } from '../../state/actions';
import { docStore, lightboxStore, sketchStore, ttlStore } from '../../state/stores';
import type { IconName } from '../../ui/Icon';
import { openInMap } from '../location/LocationBody';
import { readableUrl } from './FileImage';

export type ItemAction = {
  key: string;
  icon: IconName;
  label: string;
  run: () => void;
  danger?: boolean;
  /** 工具条按钮上更详细的说明 */
  hint?: string;
  /** 只放在工具条上，右键菜单里没有 */
  barOnly?: boolean;
};

/** 这种元素专属的操作。edit 是进入编辑（便利贴改文字、位置改名）：工具条和右键菜单各有各的进法 */
export function kindActions(item: Item, edit: () => void): ItemAction[] {
  switch (item.type) {
    case 'note':
      return [
        { key: 'edit', icon: 'edit', label: '编辑', run: edit },
        { key: 'copy', icon: 'copy', label: '复制文字', run: () => copyText(item.text) },
      ];
    case 'location':
      return [
        { key: 'map', icon: 'open', label: '在地图中打开', run: () => openInMap(item) },
        { key: 'coords', icon: 'copy', label: '复制坐标', run: () => copyText(fmtCoords(item), '坐标已复制') },
        { key: 'rename', icon: 'edit', label: '改名', run: edit },
      ];
    case 'image':
    case 'file': {
      // 手机那边还在传：文件还没有，什么都做不了
      if (item.pending) return [];
      const f = item.file;
      const dl: ItemAction = { key: 'dl', icon: 'download', label: '下载', run: () => download(f) };
      if (item.type === 'file') {
        return previewKind(f.name) === 'doc' ? [{ key: 'doc', icon: 'open', label: '翻看', run: () => docStore.set(f), barOnly: true }, dl] : [dl];
      }
      return [
        { key: 'draw', icon: 'brush', label: '在上面画', hint: '在上面画（存成一张新图，原图不动）', run: () => sketchStore.set({ at: Date.now(), bg: f, pos: { x: item.x + 300, y: item.y } }) },
        { key: 'open', icon: 'open', label: '看大图', run: () => lightboxStore.set(f) },
        { key: 'copyimg', icon: 'copy', label: '复制图片', run: () => copyImage(readableUrl(f)) },
        dl,
      ];
    }
  }
}

/** 废纸篓里只有这两样：放回原来的白板（按默认保留时长重新计时）、彻底删除 */
export function trashActions(item: Item, boards: Board[], actions: Actions): ItemAction[] {
  const boardName = (id?: string) => boards.find((b) => b.id === id)?.name;
  const restore = async () => {
    const r = await actions.move(TRASH, item, undefined, { ttl: ttlStore.get() });
    if (r) toast(`已放回「${boardName(r.to) ?? '白板'}」`);
  };
  return [
    { key: 'restore', icon: 'undo', label: `放回「${boardName(item.from) ?? '第一块白板'}」`, run: restore },
    { key: 'purge', icon: 'trash', label: '彻底删除', danger: true, run: () => { if (confirm('彻底删除？删了就找不回来了')) actions.remove(TRASH, item); } },
  ];
}

export const shareAction = (item: Item, mobile: boolean): ItemAction =>
  ({ key: 'share', icon: 'link', label: '复制分享链接', run: () => shareLink(shareUrl(item.boardId, item.id), mobile) });

/** 能移过去的白板：别的普通白板 */
export const moveTargets = (boards: Board[], boardId: string) => boards.filter((b) => b.id !== boardId && !isSystemBoard(b.id));
export async function moveToBoard(actions: Actions, boardId: string, item: Item, to: Board) {
  if (await actions.move(boardId, item, to.id)) toast(`已移到「${to.name}」`);
}
