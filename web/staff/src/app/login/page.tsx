'use client';

import { ApiError } from '@albarakah/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useApi } from '@/lib/api';

const demos = [
  { role: 'ADMIN', label: 'Continue as demo admin', href: '/admin' },
  { role: 'RIDER', label: 'Continue as demo rider', href: '/delivery' },
  { role: 'DOCTOR', label: 'Continue as demo doctor', href: '/doctor' },
] as const;

export default function StaffLoginPage() {
  const { api } = useApi();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function demo(role: (typeof demos)[number]['role'], href: string) {
    setBusy(true);
    setError(null);
    try {
      await api.demoLogin(role);
      router.replace(href);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Demo login is unavailable.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-stack">
      <div className="staff-hero">
        <h1 className="title">Staff sign in</h1>
        <p className="muted">Use a demo account in development, or OTP on a staff phone in production.</p>
      </div>
      {error && <p className="error">{error}</p>}
      {demos.map((d) => (
        <button key={d.role} className="btn primary block" disabled={busy} onClick={() => void demo(d.role, d.href)}>
          {busy ? 'Signing in…' : d.label}
        </button>
      ))}
    </div>
  );
}
