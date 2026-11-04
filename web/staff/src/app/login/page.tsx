'use client';

import { haptic, toast } from '@albarakah/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api, useApi } from '@/lib/api';
import { homeFor, message } from '@/lib/app';

type Step = 'phone' | 'code' | 'totp-setup' | 'totp';

const STAFF = new Set(['ADMIN', 'RIDER', 'DOCTOR']);
const DEMO_LABEL: Record<string, string> = { ADMIN: 'Admin', RIDER: 'Rider', DOCTOR: 'Doctor' };

function normalisePhone(raw: string) {
  const d = raw.replace(/\D/g, '');
  if (/^01\d{9}$/.test(d)) return `+88${d}`;
  if (/^8801\d{9}$/.test(d)) return `+${d}`;
  return null;
}

export default function StaffLoginPage() {
  const { user, ready } = useApi();
  const router = useRouter();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [demoRoles, setDemoRoles] = useState<string[]>([]);
  const codeRef = useRef<HTMLInputElement>(null);

  // Already signed in (fully): skip the form.
  useEffect(() => {
    if (!ready || !user) return;
    if (!STAFF.has(user.role)) return;
    if (user.role === 'ADMIN' && !user.mfa) {
      void toTotp(user.totpEnabled);
      return;
    }
    router.replace(homeFor(user.role));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user]);

  useEffect(() => {
    api
      .get<{ roles: string[] }>('/auth/demo-accounts')
      .then((r) => setDemoRoles((r.roles ?? []).filter((x) => STAFF.has(x))))
      .catch(() => setDemoRoles([]));
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  useEffect(() => {
    if (step !== 'phone') setTimeout(() => codeRef.current?.focus(), 60);
  }, [step]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      haptic('warning');
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  async function toTotp(enabled?: boolean) {
    setCode('');
    if (enabled) {
      setStep('totp');
      return;
    }
    try {
      setSetup(await api.totpSetup());
      setStep('totp-setup');
    } catch {
      setStep('totp');
    }
  }

  const sendOtp = () =>
    run(async () => {
      const p = normalisePhone(phone);
      if (!p) throw new Error('Enter a Bangladeshi mobile number, like 01712 345678.');
      await api.requestOtp(p);
      setPhone(p);
      setCode('');
      setStep('code');
      setResendIn(45);
    });

  const verifyOtp = () =>
    run(async () => {
      const u = await api.verifyOtp(phone, code);
      if (!STAFF.has(u.role)) {
        await api.logout();
        throw new Error('This number is not a staff account.');
      }
      if (u.role === 'ADMIN' && !u.mfa) await toTotp(u.totpEnabled);
      else router.replace(homeFor(u.role));
    });

  const verifyTotp = () =>
    run(async () => {
      const u = await api.totpVerify(code);
      toast('Two-factor verified');
      router.replace(homeFor(u.role));
    });

  const demo = (role: string) =>
    run(async () => {
      await api.demoLogin(role);
      const u = api.user;
      if (u?.role === 'ADMIN' && !u.mfa) await toTotp(u.totpEnabled);
      else router.replace(homeFor(role));
    });

  const codeLen = 6;

  return (
    <div className="login">
      <div className="login-card screen">
        <div className="login-mark" aria-hidden="true">+</div>
        <h1 className="login-title">
          {step === 'phone' ? 'Staff sign in' : step === 'code' ? 'Enter the code' : step === 'totp-setup' ? 'Set up two-factor' : 'Authenticator code'}
        </h1>
        <p className="muted small login-sub">
          {step === 'phone' && 'Admins, riders and doctors sign in with their registered phone.'}
          {step === 'code' && <>We sent a 6-digit code to <strong className="mono">{phone}</strong>.</>}
          {step === 'totp-setup' && 'Admin accounts need an authenticator app. Add this key, then enter the 6-digit code it shows.'}
          {step === 'totp' && 'Open your authenticator app and enter the current code for BarakaBari.'}
        </p>

        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (busy) return;
            if (step === 'phone') void sendOtp();
            else if (step === 'code') void verifyOtp();
            else void verifyTotp();
          }}
        >
          {step === 'phone' ? (
            <label className="field">
              Mobile number
              <input
                className="input"
                inputMode="tel"
                autoComplete="tel"
                placeholder="01712 345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoFocus
              />
            </label>
          ) : (
            <>
              {step === 'totp-setup' && setup ? (
                <div className="group">
                  <div className="stack" style={{ gap: 6, alignItems: 'stretch' }}>
                    <span className="muted small">Setup key</span>
                    <code className="mono secret">{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</code>
                    <div className="row wrap" style={{ gap: 8 }}>
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => {
                          void navigator.clipboard?.writeText(setup.secret).then(() => toast('Key copied', 'info'));
                        }}
                      >
                        Copy key
                      </button>
                      <a className="btn small ghost" href={setup.otpauthUrl}>
                        Open in authenticator
                      </a>
                    </div>
                  </div>
                </div>
              ) : null}
              <input
                ref={codeRef}
                className="input otp-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={codeLen}
                placeholder="••••••"
                aria-label="Code"
                value={code}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, codeLen);
                  setCode(v);
                }}
              />
            </>
          )}

          {error ? <p className="error" role="alert">{error}</p> : null}

          <button className="btn primary block" disabled={busy || (step !== 'phone' && code.length !== codeLen)}>
            {busy ? 'Please wait…' : step === 'phone' ? 'Send code' : 'Continue'}
          </button>

          {step === 'code' ? (
            <div className="row between">
              <button type="button" className="btn ghost small" onClick={() => setStep('phone')}>
                Change number
              </button>
              <button type="button" className="btn ghost small" disabled={resendIn > 0 || busy} onClick={() => void sendOtp()}>
                {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
              </button>
            </div>
          ) : null}
          {step === 'totp-setup' ? (
            <button type="button" className="btn ghost small" onClick={() => setStep('totp')}>
              I already set this up
            </button>
          ) : null}
        </form>

        {step === 'phone' && demoRoles.length ? (
          <div className="stack demo">
            <p className="group-label" style={{ margin: '8px 0 0' }}>Demo accounts</p>
            <div className="row wrap" style={{ gap: 8 }}>
              {demoRoles.map((r) => (
                <button key={r} type="button" className="btn small grow" disabled={busy} onClick={() => void demo(r)}>
                  {DEMO_LABEL[r] ?? r}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
