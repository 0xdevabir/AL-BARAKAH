'use client';

import { useEffect, useRef } from 'react';

export function Sheet({
  open,
  onClose,
  title,
  dismissible = true,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  dismissible?: boolean;
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    return () => {
      try {
        dialog.current?.close();
      } catch {
        /* already closed */
      }
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      className="sheet"
      aria-label={title}
      onClose={onClose}
      onCancel={(e) => {
        if (!dismissible) e.preventDefault();
      }}
      onClick={(e) => {
        if (e.target === dialog.current && dismissible) onClose();
      }}
    >
      <div className="sheet-body">
        {dismissible ? <div className="grab" aria-hidden="true" /> : null}
        <h2>{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
