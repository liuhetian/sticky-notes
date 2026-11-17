// 双击空白处新建的便利贴：先在本地写，存的时候才交给外面真正创建；写空了就当没建
import clsx from 'clsx';
import { useState, type CSSProperties } from 'react';
import { COLORS, expiryFrom } from '@/shared/constants';
import type { NoteItem } from '@/shared/schema';
import { serverNow } from '../../api/client';
import { colorStore } from '../../state/stores';
import { fmtDay, remain, rotFor } from '../../lib/format';
import { Icon, IconButton } from '../../ui/Icon';
import { NoteEditor } from './NoteBody';

export function DraftNote({ x, y, ttl, onSave, onCancel }: {
  x: number; y: number;
  /** 存下以后保留多久：底栏的倒计时照这个显示 */
  ttl: number | null;
  onSave: (text: string, color: NoteItem['color']) => void;
  onCancel: () => void;
}) {
  const [color, setColor] = useState<NoteItem['color']>(colorStore.get);
  const [createdAt] = useState(serverNow);
  // 手机上排成一列时排在最前面
  const style = { left: x, top: y, '--rot': `${rotFor('draft')}deg`, order: -2147483000 } as CSSProperties;
  return (
    // 没有 data-id：右键、拉框、连线都不认它；右键用浏览器自己的菜单，好粘贴
    <div className={clsx('item note editing draft', color)} style={style} onContextMenu={(e) => e.stopPropagation()}>
      <div className="bar">
        {COLORS.map((c) => (
          <button key={c} type="button" className={clsx('swatch', c, c === color && 'on')} title="换颜色" aria-label="换颜色"
            onClick={(e) => { e.stopPropagation(); setColor(c); }} />
        ))}
        <span className="sep" />
        <IconButton name="trash" title="不要了" className="danger" onClick={onCancel} />
      </div>
      <div className="tape" />
      <NoteEditor initial="" onDone={(text) => (text?.trim() ? onSave(text, color) : onCancel())} />
      <div className="foot">
        <span className="when">{fmtDay(createdAt)}</span>
        <span className="foot-r"><span className="chip"><Icon name="clock" />{remain({ expiresAt: expiryFrom(ttl, createdAt) })}</span></span>
      </div>
    </div>
  );
}
