import { ApiClient } from '@albarakah/ui';

export const api = new ApiClient('/api');

/** Accepts "120" or "120.50" and returns poisha, without floating-point rounding surprises. */
export function tkToPoisha(value: string): number | null {
  const m = /^(\d{1,7})(?:\.(\d{1,2}))?$/.test(value.trim()) ? value.trim().split('.') : null;
  if (!m) return null;
  return Number(m[0]) * 100 + Number((m[1] ?? '').padEnd(2, '0') || 0);
}

export const poishaToTk = (p: number) => (p % 100 === 0 ? String(p / 100) : (p / 100).toFixed(2));

export const statusLabel = (s: string) => s.replaceAll('_', ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());

export const homeFor = (role: string) => (role === 'ADMIN' ? '/admin' : role === 'RIDER' ? '/delivery' : role === 'DOCTOR' ? '/doctor' : '/');

export const message = (err: unknown) => (err as Error).message;
