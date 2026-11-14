// 底部居中的操作栏：V 选择 / H 抓手、多选后的批量删除，最后一个是新建（废纸篓里换成清空）
import clsx from 'clsx';
import { Icon } from '../../ui/Icon';
import { PlusMenu, type CreateHandlers } from './CreateMenu';

export function Toolbar({ hand, onTool, selectedCount, onDeleteSelected, onClearSelection, inTrash, trashCount, onClearTrash, create }: {
  hand: boolean;
  onTool: (tool: 'select' | 'hand') => void;
  selectedCount: number;
  onDeleteSelected: () => void;
  onClearSelection: () => void;
  inTrash: boolean;
  trashCount: number;
  onClearTrash: () => void;
  create: CreateHandlers;
}) {
  return (
    <div className="toolbar">
      <button type="button" className={clsx('tb-tool', !hand && 'on')} title="移动元素、拉框多选（V）" onClick={() => onTool('select')}><Icon name="pointer" /><kbd>V</kbd></button>
      <button type="button" className={clsx('tb-tool', hand && 'on')} title="抓手：拖动画布（H，或按住空格）" onClick={() => onTool('hand')}><Icon name="hand" /><kbd>H</kbd></button>
      {selectedCount > 0 && (
        <>
          <span className="tb-sep" />
          <span className="sel-count">已选 {selectedCount} 项</span>
          <button type="button" className="tb-danger" title="Delete 键也行" onClick={onDeleteSelected}><Icon name="trash" />{inTrash ? '彻底删除' : '删除'}</button>
          <button type="button" className="tb-ib" title="取消选择（Esc）" onClick={onClearSelection}><Icon name="x" /></button>
        </>
      )}
      <span className="tb-sep" />
      {inTrash ? (
        <button type="button" className="tb-danger" disabled={!trashCount} onClick={onClearTrash}><Icon name="trash" />清空废纸篓</button>
      ) : (
        <PlusMenu className="tb-plus" side="top" {...create} />
      )}
    </div>
  );
}
