'use client';

import { ApiError } from '@albarakah/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BrandLockup } from '@/components/BrandLockup';
import { useApi } from '@/lib/api';

export default function LoginPage() {
  const { api } = useApi();
  const router = useRouter();
  const [phone, setPhone] = useState('+880');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestOtp() {
    setBusy(true);
    setError(null);
    try {
      await api.requestOtp(phone);
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      await api.verifyOtp(phone, code);
      router.replace('/account');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not verify the code.');
    } finally {
      setBusy(false);
    }
  }

  async function demo() {
    setBusy(true);
    setError(null);
    try {
      await api.demoLogin('CUSTOMER');
      router.replace('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Demo login is unavailable.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <div>
        <BrandLockup size={30} />
        <h1 className="title">Sign in</h1>
        <p className="muted">We text a one-time code to your phone. No password to remember.</p>
      </div>

      <div className="login-panel">
        <label className="field">
          Phone
          <input
            className="input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            autoComplete="tel"
            autoFocus
          />
        </label>
        {sent && (
          <label className="field">
            Code
            <input
              className="input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
            />
          </label>
        )}
        {error && <p className="error">{error}</p>}
        {!sent ? (
          <button className="btn primary block" disabled={busy} onClick={() => void requestOtp()}>
            {busy ? 'Sending…' : 'Send code'}
          </button>
        ) : (
          <button className="btn primary block" disabled={busy || code.length < 4} onClick={() => void verify()}>
            {busy ? 'Checking…' : 'Verify'}
          </button>
        )}
        <button className="btn ghost block" disabled={busy} onClick={() => void demo()}>
          Continue as demo customer
        </button>
      </div>
    </div>
  );
}
