'use client';

import { useEffect, useRef } from 'react';

/**
 * Bottom sheet on phones, centred card on wide screens. On touch it follows the finger
 * and dismisses past a threshold or a quick flick — the iOS card gesture.
 */
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
  const body = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) {
      el.style.transform = '';
      el.showModal();
      document.documentElement.classList.add('sheet-open');
    }
    if (!open && el.open) {
      el.close();
    }
    if (!open) document.documentElement.classList.remove('sheet-open');
  }, [open]);

  useEffect(() => {
    return () => {
      document.documentElement.classList.remove('sheet-open');
      try {
        dialog.current?.close();
      } catch {
        /* already closed */
      }
    };
  }, []);

  function onTouchStart(e: React.TouchEvent) {
    if (!dismissible || window.matchMedia('(min-width: 720px)').matches) return;
    // Drag from the grabber/header any time, or from the content once it is scrolled to the top,
    // so inner scrolling still works.
    const onHandle = (e.target as HTMLElement).closest('.grab, .sheet-head');
    if (!onHandle && (body.current?.scrollTop ?? 0) > 0) return;
    drag.current = { y: e.touches[0]!.clientY, t: Date.now(), dy: 0 };
  }
  function onTouchMove(e: React.TouchEvent) {
    const d = drag.current;
    const el = dialog.current;
    if (!d || !el) return;
    const dy = e.touches[0]!.clientY - d.y;
    d.dy = dy;
    // Pulling up past the resting point resists, like a rubber band.
    const shown = dy >= 0 ? dy : -Math.sqrt(-dy) * 2.2;
    el.style.transition = 'none';
    el.style.transform = `translateY(${shown}px)`;
  }
  function onTouchEnd() {
    const d = drag.current;
    const el = dialog.current;
    drag.current = null;
    if (!d || !el) return;
    const velocity = d.dy / Math.max(1, Date.now() - d.t);
    if (d.dy > 140 || (d.dy > 40 && velocity > 0.6)) {
      el.style.transition = 'transform 0.26s cubic-bezier(0.32, 0.72, 0, 1)';
      el.style.transform = 'translateY(110%)';
      setTimeout(onClose, 220);
    } else {
      el.style.transition = 'transform 0.5s cubic-bezier(0.22, 1.25, 0.36, 1)';
      el.style.transform = '';
    }
  }

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
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div className="sheet-body" ref={body}>
        {dismissible ? <div className="grab" aria-hidden="true" /> : null}
        <div className="sheet-head">
          <h2>{title}</h2>
          {dismissible ? (
            <button type="button" className="sheet-x" aria-label="Close" onClick={onClose}>
              ×
            </button>
          ) : null}
        </div>
        {open ? children : null}
      </div>
    </dialog>
  );
}
