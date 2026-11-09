'use client';

import { formatTk } from '@albarakah/domain';
import { confirmAction, DoctorCard, DoctorProfileView, haptic, invalidate, LargeTitle, Segmented, Sheet, SkeletonList, toast } from '@albarakah/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  AboutFields, bodyFrom, CallFields, formFrom, meetLinkBad, phoneBad, PhotoPicker, previewOf, type ProfileForm, sameForm,
} from '@/components/DoctorProfileFields';
import { api, useGet } from '@/lib/api';
import { message } from '@/lib/app';
import { CHANNEL, type DoctorMe, type DoctorSummary } from '@/lib/doctor';

export default function DoctorProfile() {
  const router = useRouter();
  const { data: me, pending } = useGet<DoctorMe>('/doctor/me');
  const { data: s } = useGet<DoctorSummary>('/doctor/summary');
  const [f, setF] = useState<ProfileForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [view, setView] = useState<'card' | 'profile'>('card');
  useEffect(() => {
    if (me) setF(formFrom(me));
  }, [me]);

  const set = <K extends keyof ProfileForm>(k: K, v: ProfileForm[K]) => setF((prev) => (prev ? { ...prev, [k]: v } : prev));
  const dirty = !!me && !!f && !sameForm(f, formFrom(me));
  const invalid = !!f && (meetLinkBad(f.meetLink) || phoneBad(f.whatsapp) || f.name.trim().length < 2 || !f.qualifications.trim());

  async function save() {
    if (!f) return;
    setBusy(true);
    try {
      await api.put('/doctor/profile', bodyFrom(f));
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
      {me && f ? (
        <div className="stack">
          <div className="dpf-status panel">
            <span className={`dpf-dot${me.isActive ? ' on' : ''}`} aria-hidden="true" />
            <span className="grow" style={{ minWidth: 0 }}>
              <strong>{me.isActive ? 'Live in the BarakaBari app' : 'Hidden by BarakaBari'}</strong>
              <span className="muted small" style={{ display: 'block' }}>
                {me.isActive ? 'Patients can find and book you.' : 'Patients can’t book you right now. Contact the BarakaBari team.'}
              </span>
            </span>
            <button type="button" className="btn small" onClick={() => setPreview(true)}>Preview</button>
          </div>

          <PhotoPicker me={me} f={f} set={set} />

          <p className="group-label">About you</p>
          <AboutFields f={f} set={set} />

          <p className="group-label">Calls</p>
          <CallFields me={me} f={f} set={set} />

          <p className="group-label">Set by BarakaBari</p>
          <div className="group">
            <div className="cell"><span className="cell-main"><span>Specialty</span></span><strong>{me.specialty}</strong></div>
            <div className="cell"><span className="cell-main"><span>BMDC number</span></span><strong className="mono">{me.bmdcNo}</strong></div>
            <div className="cell"><span className="cell-main"><span>Call types</span></span><strong>{me.channels.map((c) => CHANNEL[c]).join(', ')}</strong></div>
            <div className="cell"><span className="cell-main"><span>Fee</span></span><strong>{me.feePoisha !== null ? formatTk(me.feePoisha) : 'Standard fee'}</strong></div>
            <div className="cell"><span className="cell-main"><span>Sign-in number</span></span><strong className="mono">{me.user.phone}</strong></div>
          </div>
          <p className="muted small" style={{ marginTop: -4 }}>To change these, contact the BarakaBari team.</p>

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

          {dirty ? (
            <div className="dpf-savebar">
              <span className="grow small">Unsaved changes</span>
              <button type="button" className="btn ghost small" disabled={busy} onClick={() => setF(formFrom(me))}>Discard</button>
              <button type="button" className="btn primary small" disabled={busy || invalid} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          ) : null}

          <Sheet open={preview} onClose={() => setPreview(false)} title="How patients see you">
            <div className="stack">
              <Segmented value={view} onChange={setView} label="Preview" options={[{ value: 'card', label: 'In the list' }, { value: 'profile', label: 'Full profile' }]} />
              {view === 'card' ? (
                <DoctorCard d={previewOf(me, f, s?.patients ?? 0)} footer={<><span className="grow muted small">Next free time</span><span className="btn primary small" aria-hidden="true">Book</span></>} />
              ) : (
                <DoctorProfileView d={previewOf(me, f, s?.patients ?? 0)} />
              )}
              {dirty ? <p className="muted small">Showing your unsaved changes.</p> : null}
            </div>
          </Sheet>
        </div>
      ) : null}
    </>
  );
}
