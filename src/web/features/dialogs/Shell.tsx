import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { Icon } from '../../ui/Icon';

/** 普通弹窗的外壳：遮罩、标题、右上角关闭 */
export function Shell({ open, onClose, className, title, children }: { open: boolean; onClose: () => void; className: string; title: string; children: ReactNode }) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className={`dialog ${className}`} aria-describedby={undefined}>
          <Dialog.Title className="dialog-title">{title}</Dialog.Title>
          {children}
          <Dialog.Close className="dialog-x" aria-label="关闭"><Icon name="x" /></Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
