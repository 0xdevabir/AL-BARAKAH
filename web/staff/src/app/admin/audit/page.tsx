'use client';

import { EmptyState, fmtWhen, LargeTitle, SkeletonList } from '@albarakah/ui';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { message } from '@/lib/app';

interface Entry { id: string; action: string; entity: string; entityId: string | null; data: unknown; createdAt: string; actor: { name: string; role: string; phone: string } | null }

const FILTERS = [
  { value: '', label: 'Everything' },
  { value: 'order', label: 'Orders' },
  { value: 'medicine', label: 'Catalog' },
  { value: 'batch', label: 'Stock' },
  { value: 'staff', label: 'Staff' },
  { value: 'doctor', label: 'Doctors' },
  { value: 'rider', label: 'Cash' },
  { value: 'settings', label: 'Settings' },
  { value: 'prescription', label: 'Rx views' },
  { value: 'payment', label: 'Payments' },
];

const describe = (a: string) =>
  ({
    'prescription.view': 'Viewed a prescription',
    'medicine.create': 'Added a medicine',
    'medicine.update': 'Edited a medicine',
    'batch.write_off': 'Wrote off stock',
    'staff.add': 'Added a staff member',
    'staff.active': 'Changed staff access',
    'doctor.onboard': 'Onboarded a doctor',
    'doctor.active': 'Changed doctor availability',
    'rider.settle': 'Settled rider cash',
  })[a] ?? a.replace(/[._]/g, ' ');

export default function AuditPage() {
  const [action, setAction] = useState('');
  const [items, setItems] = useState<Entry[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(before?: string) {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (action) qs.set('action', action);
      if (before) qs.set('before', before);
      const r = await api.get<{ items: Entry[]; next: string | null }>(`/admin/audit?${qs}`);
      setItems((prev) => (before ? [...prev, ...r.items] : r.items));
      setNext(r.next);
      setError(null);
    } catch (err) {
      setError(message(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action]);

  return (
    <>
      <LargeTitle sub="Who changed what, and when">Audit log</LargeTitle>
      <div className="hscroll" style={{ marginBottom: 14 }}>
        {FILTERS.map((f) => (
          <button key={f.value} className={`btn small${action === f.value ? ' primary' : ''}`} onClick={() => setAction(f.value)}>
            {f.label}
          </button>
        ))}
      </div>
      {error ? <p className="error">{error}</p> : null}
      {loading && !items.length ? <SkeletonList rows={8} /> : null}
      {!loading && !items.length ? <EmptyState icon="🛡" title="Nothing recorded" /> : null}
      {items.length ? (
        <div className="group cv">
          {items.map((e) => (
            <details key={e.id} className="audit-row">
              <summary>
                <span className="cell-main">
                  <strong>{describe(e.action)}</strong>
                  <span className="cell-sub">
                    {e.actor ? `${e.actor.name} (${e.actor.role.toLowerCase()})` : 'System'} · {fmtWhen(e.createdAt)}
                  </span>
                </span>
                <span className="chip off">{e.entity}</span>
              </summary>
              <pre className="mono audit-data">{JSON.stringify({ id: e.entityId, ...(e.data && typeof e.data === 'object' ? e.data : {}) }, null, 2)}</pre>
            </details>
          ))}
        </div>
      ) : null}
      {next ? (
        <button className="btn block" style={{ marginTop: 14 }} disabled={loading} onClick={() => void load(next)}>
          {loading ? 'Loading…' : 'Load older'}
        </button>
      ) : null}
    </>
  );
}
