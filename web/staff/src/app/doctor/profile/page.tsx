'use client';

import { formatTk } from '@albarakah/domain';
import { confirmAction, haptic, initials, invalidate, LargeTitle, SkeletonList, toast } from '@albarakah/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, useGet } from '@/lib/api';
import { message } from '@/lib/app';
import { CHANNEL, type DoctorMe } from '@/lib/doctor';

export default function DoctorProfile() {
  const router = useRouter();
  const { data: me, pending } = useGet<DoctorMe>('/doctor/me');
  const [f, setF] = useState({ bio: '', meetLink: '', whatsapp: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (me) setF({ bio: me.bio, meetLink: me.meetLink ?? '', whatsapp: me.whatsapp ?? '' });
  }, [me]);

  const dirty = !!me && (f.bio !== me.bio || f.meetLink !== (me.meetLink ?? '') || f.whatsapp !== (me.whatsapp ?? ''));
  const meetBad = f.meetLink && !/^https:\/\/\S+$/.test(f.meetLink);

  async function save() {
    setBusy(true);
    try {
      await api.put('/doctor/profile', { bio: f.bio.trim(), meetLink: f.meetLink.trim(), whatsapp: f.whatsapp.trim() });
      haptic('success');
      toast('Profile saved');
      invalidate('/doctor/me');
    } catch (e) {
      toast(message(e), 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <LargeTitle>Profile</LargeTitle>
      {pending ? <SkeletonList rows={4} /> : null}
      {me ? (
        <div className="stack">
          <div className="panel row" style={{ gap: 14 }}>
            <span className="avatar lg">{initials(me.user.name)}</span>
            <span className="grow">
              <strong>{me.user.name}</strong>
              <span className="muted small" style={{ display: 'block' }}>{me.specialty} · BMDC {me.bmdcNo}</span>
              <span className="muted small" style={{ display: 'block' }}>{me.channels.map((c) => CHANNEL[c]).join(' · ')}{me.feePoisha !== null ? ` · ${formatTk(me.feePoisha)}` : ''}</span>
            </span>
            {!me.isActive ? <span className="chip off">Hidden</span> : null}
          </div>

          <label className="field">
            <span>About you</span>
            <textarea className="input" rows={4} maxLength={1000} value={f.bio} placeholder="Experience, languages, what you treat" onChange={(e) => setF({ ...f, bio: e.target.value })} />
            <span className="muted small">{f.bio.length}/1000 · shown to patients when they book</span>
          </label>
          {me.channels.includes('GOOGLE_MEET') ? (
            <label className="field">
              <span>Google Meet link</span>
              <input className="input" inputMode="url" placeholder="https://meet.google.com/abc-defg-hij" value={f.meetLink} onChange={(e) => setF({ ...f, meetLink: e.target.value })} />
              {meetBad ? <span className="error small">Must start with https://</span> : <span className="muted small">Use a permanent room link so every patient joins the same room.</span>}
            </label>
          ) : null}
          {me.channels.includes('WHATSAPP') ? (
            <label className="field">
              <span>WhatsApp number</span>
              <input className="input" inputMode="tel" placeholder="+8801XXXXXXXXX" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} />
            </label>
          ) : null}
          <button className="btn primary block" disabled={!dirty || busy || !!meetBad} onClick={() => void save()}>{busy ? 'Saving…' : 'Save profile'}</button>

          <div className="group" style={{ marginTop: 12 }}>
            <button
              className="press"
              onClick={async () => {
                if (!(await confirmAction({ title: 'Sign out?', confirm: 'Sign out', destructive: true }))) return;
                await api.logout();
                router.replace('/login');
              }}
            >
              <span className="cell-main"><strong className="error">Sign out</strong></span>
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
