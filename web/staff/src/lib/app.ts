export function tkToPoisha(value: string): number | null {
  const m = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

export const poishaToTk = (p: number) => (p % 100 === 0 ? String(p / 100) : (p / 100).toFixed(2));
export { statusLabel, statusTone } from '@albarakah/ui';
export const homeFor = (role: string) => (role === 'ADMIN' ? '/admin' : role === 'RIDER' ? '/delivery' : role === 'DOCTOR' ? '/doctor' : '/login');
export const message = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong.');

export const minutesToHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const hhmmToMinutes = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Pinned addresses open exact directions; older ones fall back to a text search. */
export const mapsLink = (address: string, at?: { lat?: number | null; lng?: number | null }) =>
  typeof at?.lat === 'number' && typeof at?.lng === 'number'
    ? `https://www.google.com/maps/dir/?api=1&destination=${at.lat},${at.lng}&travelmode=two-wheeler`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address}, Bangladesh`)}`;
export const telLink = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;
export const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Client-side CSV export: no server round trip, opens in Excel with Bangla intact (BOM). */
export function downloadCsv(name: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const blob = new Blob(['﻿', rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
