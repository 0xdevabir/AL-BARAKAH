'use client';

import { formatTk } from '@albarakah/domain';
import { ApiError, haptic, Skeleton } from '@albarakah/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { message } from '@/lib/app';
import { CHANNEL, type Channel } from '@/lib/doctor';

interface Invite {
  name: string; email: string; bmdcNo: string; specialty: string; feePoisha: number | null;
  channels: Channel[]; expiresAt: string; invitedBy: string;
}
type Step = 'loading' | 'invalid' | 'welcome' | 'phone' | 'code';

function normalisePhone(raw: string) {
  const d = raw.replace(/\D/g, '');
  if (/^01\d{9}$/.test(d)) return `+88${d}`;
  if (/^8801\d{9}$/.test(d)) return `+${d}`;
  return null;
}

/**
 * Where the invitation email lands. The token sits in the URL fragment, so it never reaches a server log.
 * The doctor confirms the mobile number they will sign in with, and the account is created on the spot.
 */
export default function JoinPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [invite, setInvite] = useState<Invite | null>(null);
  const [step, setStep] = useState<Step>('loading');
  const [problem, setProblem] = useState<{ title: string; body: string } | null>(null);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = window.location.hash.replace(/^#/, '').trim();
    setToken(t);
    if (!t) {
      setProblem({ title: 'This link is incomplete', body: 'Open the invitation straight from your email, or ask the BarakaBari team to send it again.' });
      setStep('invalid');
      return;
    }
    api.get<Invite>(`/auth/doctor-invite/${encodeURIComponent(t)}`)
      .then((inv) => {
        setInvite(inv);
        setStep('welcome');
      })
      .catch((e) => {
        const used = e instanceof ApiError && e.code === 'INVITE_USED';
        setProblem({ title: used ? 'Already set up' : e instanceof ApiError && e.code === 'INVITE_EXPIRED' ? 'This invitation has expired' : 'This link isn’t valid', body: message(e) });
        setStep('invalid');
      });
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  useEffect(() => {
    if (step === 'code') setTimeout(() => codeRef.current?.focus(), 60);
  }, [step]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      haptic('warning');
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  const sendCode = () => run(async () => {
    const p = normalisePhone(phone);
    if (!p) throw new Error('Enter a Bangladeshi mobile number, like 01712 345678.');
    await api.post(`/auth/doctor-invite/${encodeURIComponent(token)}/otp`, { phone: p });
    setPhone(p);
    setCode('');
    setStep('code');
    setResendIn(45);
  });

  const accept = () => run(async () => {
    await api.acceptDoctorInvite(token, phone, code);
    haptic('success');
    // Drop the token from history so Back doesn't reopen a used link.
    window.history.replaceState(null, '', '/join');
    router.replace('/onboarding');
  });

  const daysLeft = invite ? Math.max(0, Math.ceil((new Date(invite.expiresAt).getTime() - Date.now()) / 86_400_000)) : 0;

  return (
    <div className="login">
      <div className="login-card screen">
        <div className="login-mark" aria-hidden="true">+</div>

        {step === 'loading' ? (
          <div className="stack">
            <Skeleton h={28} />
            <Skeleton h={90} r={20} />
          </div>
        ) : null}

        {step === 'invalid' && problem ? (
          <div className="stack">
            <h1 className="login-title">{problem.title}</h1>
            <p className="muted">{problem.body}</p>
            <button type="button" className="btn primary block" onClick={() => router.replace('/login')}>Go to sign in</button>
          </div>
        ) : null}

        {invite && step === 'welcome' ? (
          <div className="stack">
            <h1 className="login-title">Welcome, {invite.name}</h1>
            <p className="muted small login-sub">{invite.invitedBy || 'The BarakaBari team'} invited you to consult on BarakaBari.</p>
            <div className="join-hero">
              <span className="muted small">Your listing</span>
              <strong style={{ fontSize: '1.15rem' }}>{invite.specialty}</strong>
              <span className="muted small">BMDC {invite.bmdcNo}</span>
              <div className="join-facts">
                {invite.channels.map((c) => <span key={c}>{CHANNEL[c]}</span>)}
                {invite.feePoisha !== null ? <span>{formatTk(invite.feePoisha)} per consult</span> : null}
              </div>
            </div>
            <ol className="ob-check">
              <li className="done">Confirm the mobile number you’ll sign in with</li>
              <li className="done">Add your photo, qualifications and bio</li>
              <li className="done">Choose your hours and go live</li>
            </ol>
            <button type="button" className="btn primary block" onClick={() => setStep('phone')}>Get started</button>
            <p className="muted small" style={{ textAlign: 'center' }}>Invitation for {invite.email} · valid {daysLeft ? `${daysLeft} more day${daysLeft === 1 ? '' : 's'}` : 'today'}</p>
          </div>
        ) : null}

        {invite && (step === 'phone' || step === 'code') ? (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); void (step === 'phone' ? sendCode() : accept()); }}>
            <h1 className="login-title">{step === 'phone' ? 'Your sign-in number' : 'Enter the code'}</h1>
            <p className="muted small login-sub">
              {step === 'phone'
                ? 'You’ll sign in to BarakaBari with this mobile number. We’ll text it a code.'
                : <>We sent a 6-digit code to <strong className="mono">{phone}</strong>.</>}
            </p>
            {step === 'phone' ? (
              <label className="field">
                <span>Mobile number</span>
                <input className="input" inputMode="tel" autoComplete="tel" placeholder="01712 345678" value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus />
              </label>
            ) : (
              <input
                ref={codeRef}
                className="input otp-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                aria-label="6-digit code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            )}
            {error ? <p className="error" role="alert">{error}</p> : null}
            <button className="btn primary block" disabled={busy || (step === 'code' && code.length !== 6)}>
              {busy ? 'Please wait…' : step === 'phone' ? 'Send code' : 'Create my account'}
            </button>
            <div className="row between">
              <button type="button" className="btn ghost small" disabled={busy} onClick={() => setStep(step === 'code' ? 'phone' : 'welcome')}>Back</button>
              {step === 'code' ? (
                <button type="button" className="btn ghost small" disabled={resendIn > 0 || busy} onClick={() => void sendCode()}>
                  {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
                </button>
              ) : null}
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
