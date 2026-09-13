import type { ReactNode } from 'react';

export function Modal({
  open,
  onClose,
  children,
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  dismissable?: boolean;
}) {
  if (!open) return null;
  return (
    <div
      className="modal-backdrop"
      onClick={() => {
        if (dismissable) onClose();
      }}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
