'use client';

import { fmtRelative, invalidate, toast } from '@albarakah/ui';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { api, useApi, useGet } from '@/lib/api';

interface Request { id: string; name: string; qty: number; note: string | null; status: 'OPEN' | 'SOURCING' | 'FULFILLED' | 'CLOSED'; createdAt: string }

const STATUS: Record<Request['status'], [string, string]> = {
  OPEN: ['Received', ''],
  SOURCING: ['Sourcing', 'warn'],
  FULFILLED: ['In stock now', 'ok'],
  CLOSED: ['Closed', 'off'],
};

function RequestsInner() {
  const params = useSearchParams();
  const { user, ready } = useApi();
  const [name, setName] = useState(params.get('name') ?? '');
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const medicineId = params.get('id') ?? undefined;
  const { data: mine } = useGet<Request[]>(user ? '/medicine-requests' : null, { staleMs: 30_000 });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/medicine-requests', { name: name.trim(), qty, ...(medicineId && name === params.get('name') ? { medicineId } : {}), ...(note.trim() ? { note: note.trim() } : {}) });
      toast('Request sent. We will let you know when it is in stock.');
      setName('');
      setNote('');
      setQty(1);
      invalidate('/medicine-requests');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (ready && !user) {
    return (
      <div className="page stack">
        <h1 className="title">Request a medicine</h1>
        <p className="muted">Sign in to ask us to stock a medicine you could not find.</p>
        <Link className="btn primary" href={`/login?next=${encodeURIComponent('/requests' + (params.toString() ? `?${params}` : ''))}`}>Sign in</Link>
      </div>
    );
  }

  return (
    <div className="page stack">
      <h1 className="title">Request a medicine</h1>
      <p className="muted">Can&rsquo;t find it, or it&rsquo;s out of stock? Tell us and our pharmacy will source it, usually within 1–2 days.</p>
      <form className="stack" onSubmit={(e) => void submit(e)}>
        <label className="field">
          <span>Medicine name and strength</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} placeholder="e.g. Rivotril 0.5 mg" />
        </label>
        <label className="field">
          <span>Packs needed</span>
          <input className="input" type="number" inputMode="numeric" min={1} max={50} value={qty} onChange={(e) => setQty(Math.min(50, Math.max(1, Number(e.target.value) || 1)))} />
        </label>
        <label className="field">
          <span>Note (optional)</span>
          <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </label>
        {error ? <p className="error" role="alert">{error}</p> : null}
        <button className="btn primary block" type="submit" disabled={busy || name.trim().length < 2}>{busy ? 'Sending…' : 'Send request'}</button>
      </form>
      {mine?.length ? (
        <>
          <h2 className="section-title">Your requests</h2>
          <ul className="group">
            {mine.map((r) => (
              <li key={r.id} className="row between">
                <span className="grow">
                  <strong>{r.name}</strong>
                  <span className="muted small" style={{ display: 'block' }}>{r.qty} pack{r.qty === 1 ? '' : 's'} · {fmtRelative(r.createdAt)}</span>
                </span>
                <span className={`chip ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

export default function RequestsPage() {
  return (
    <Suspense fallback={<div className="page muted">Loading…</div>}>
      <RequestsInner />
    </Suspense>
  );
}
