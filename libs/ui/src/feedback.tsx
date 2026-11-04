'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

/** A light tap on supporting phones. Silent everywhere else. */
export function haptic(kind: 'light' | 'success' | 'warning' = 'light') {
  try {
    navigator.vibrate?.(kind === 'light' ? 8 : kind === 'success' ? [10, 40, 14] : [20, 60, 20]);
  } catch {
    /* unsupported */
  }
}

// ---------- toasts ----------
type ToastKind = 'ok' | 'bad' | 'info';
interface ToastItem { id: number; text: string; kind: ToastKind; action?: { label: string; run: () => void } }
let toasts: ToastItem[] = [];
let toastId = 0;
const toastSubs = new Set<() => void>();
const emitToasts = () => toastSubs.forEach((l) => l());

export function toast(text: string, kind: ToastKind = 'ok', action?: ToastItem['action']) {
  const id = ++toastId;
  toasts = [...toasts.slice(-2), { id, text, kind, action }];
  emitToasts();
  if (kind !== 'info') haptic(kind === 'ok' ? 'success' : 'warning');
  setTimeout(() => dismissToast(id), action ? 5000 : 3200);
}
function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emitToasts();
}

export function Toaster() {
  const list = useSyncExternalStore(
    (cb) => {
      toastSubs.add(cb);
      return () => toastSubs.delete(cb);
    },
    () => toasts,
    () => toasts,
  );
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} onClick={() => dismissToast(t.id)}>
          <span className="toast-dot" aria-hidden="true" />
          <span className="grow">{t.text}</span>
          {t.action ? (
            <button
              type="button"
              className="toast-act"
              onClick={(e) => {
                e.stopPropagation();
                t.action!.run();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

// ---------- action sheet / confirm / prompt ----------
interface SheetAction { label: string; value: string; destructive?: boolean }
interface AskRequest {
  title?: string;
  message?: string;
  actions: SheetAction[];
  input?: { placeholder?: string; required?: boolean; initial?: string; multiline?: boolean };
  resolve: (r: { value: string; text: string } | null) => void;
}
let pending: AskRequest | null = null;
const askSubs = new Set<() => void>();
const emitAsk = () => askSubs.forEach((l) => l());

function ask(req: Omit<AskRequest, 'resolve'>) {
  return new Promise<{ value: string; text: string } | null>((resolve) => {
    pending?.resolve(null);
    pending = { ...req, resolve };
    emitAsk();
  });
}

/** iOS-style confirmation. Resolves true only if the user taps the action. */
export async function confirmAction(opts: { title: string; message?: string; confirm: string; destructive?: boolean }) {
  const r = await ask({ title: opts.title, message: opts.message, actions: [{ label: opts.confirm, value: 'yes', destructive: opts.destructive }] });
  return r?.value === 'yes';
}

/** Choose one of several actions from a bottom sheet. */
export async function chooseAction(title: string, actions: SheetAction[], message?: string) {
  return (await ask({ title, message, actions }))?.value ?? null;
}

/** Ask for a short piece of text (a reason, a code). Returns null if cancelled. */
export async function promptText(opts: { title: string; message?: string; confirm: string; placeholder?: string; required?: boolean; initial?: string; multiline?: boolean; destructive?: boolean }) {
  const r = await ask({
    title: opts.title, message: opts.message,
    actions: [{ label: opts.confirm, value: 'ok', destructive: opts.destructive }],
    input: { placeholder: opts.placeholder, required: opts.required, initial: opts.initial, multiline: opts.multiline },
  });
  return r ? r.text : null;
}

export function ActionSheetHost() {
  const req = useSyncExternalStore(
    (cb) => {
      askSubs.add(cb);
      return () => askSubs.delete(cb);
    },
    () => pending,
    () => null,
  );
  const [text, setText] = useState('');
  const [closing, setClosing] = useState(false);
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!req) return;
    setText(req.input?.initial ?? '');
    setClosing(false);
    if (req.input) setTimeout(() => inputRef.current?.focus(), 250);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && finish(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req]);

  if (!req) return null;

  function finish(value: string | null) {
    if (!req) return;
    const r = value === null ? null : { value, text: text.trim() };
    setClosing(true);
    setTimeout(() => {
      if (pending === req) {
        pending = null;
        emitAsk();
      }
      req.resolve(r);
    }, 180);
  }

  const blocked = !!req.input?.required && !text.trim();
  return (
    <div className={`as-root${closing ? ' closing' : ''}`} onClick={() => finish(null)}>
      <div className="as-panel" role="dialog" aria-modal="true" aria-label={req.title} onClick={(e) => e.stopPropagation()}>
        <div className="as-group">
          {req.title || req.message ? (
            <div className="as-head">
              {req.title ? <strong>{req.title}</strong> : null}
              {req.message ? <span>{req.message}</span> : null}
            </div>
          ) : null}
          {req.input ? (
            <div className="as-input">
              {req.input.multiline ? (
                <textarea ref={inputRef} className="input" rows={3} value={text} placeholder={req.input.placeholder} onChange={(e) => setText(e.target.value)} />
              ) : (
                <input
                  ref={inputRef}
                  className="input"
                  value={text}
                  placeholder={req.input.placeholder}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !blocked && finish(req.actions[0]!.value)}
                />
              )}
            </div>
          ) : null}
          {req.actions.map((a) => (
            <button key={a.value} type="button" className={`as-btn${a.destructive ? ' destructive' : ''}`} disabled={blocked} onClick={() => finish(a.value)}>
              {a.label}
            </button>
          ))}
        </div>
        <button type="button" className="as-btn as-cancel" onClick={() => finish(null)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
