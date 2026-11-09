'use client';

import { ApiError, DoctorPhoto, type DoctorPublic, toast } from '@albarakah/ui';
import { useRef, useState } from 'react';
import { api } from '@/lib/api';
import { message } from '@/lib/app';
import type { DoctorMe } from '@/lib/doctor';

export const LANGUAGES = ['Bangla', 'English', 'Hindi', 'Urdu', 'Arabic', 'Sylheti', 'Chittagonian'];

/** Everything a doctor edits about how patients see them. Numbers stay strings while typing. */
export interface ProfileForm {
  name: string; photoUrl: string; qualifications: string; experienceYears: string; workplace: string;
  languages: string[]; bio: string; meetLink: string; whatsapp: string;
}

export const formFrom = (me: DoctorMe): ProfileForm => ({
  name: me.user.name, photoUrl: me.photoUrl ?? '', qualifications: me.qualifications ?? '',
  experienceYears: me.experienceYears ? String(me.experienceYears) : '', workplace: me.workplace ?? '',
  languages: me.languages?.length ? me.languages : ['Bangla', 'English'], bio: me.bio ?? '',
  meetLink: me.meetLink ?? '', whatsapp: me.whatsapp ?? '',
});

export const bodyFrom = (f: ProfileForm) => ({
  name: f.name.trim(), photoUrl: f.photoUrl.trim(), qualifications: f.qualifications.trim(),
  experienceYears: Math.min(70, Math.max(0, Math.round(Number(f.experienceYears) || 0))), workplace: f.workplace.trim(),
  languages: f.languages, bio: f.bio.trim(), meetLink: f.meetLink.trim(), whatsapp: f.whatsapp.trim(),
});

export const sameForm = (a: ProfileForm, b: ProfileForm) => JSON.stringify(bodyFrom(a)) === JSON.stringify(bodyFrom(b));

/** What the store will show, built from the unsaved form so the preview is live. */
export const previewOf = (me: DoctorMe, f: ProfileForm, consultations = 0): DoctorPublic => ({
  id: me.id, name: f.name.trim(), specialty: me.specialty, bmdcNo: me.bmdcNo, channels: me.channels,
  bio: f.bio.trim(), photoUrl: f.photoUrl.trim(), qualifications: f.qualifications.trim(),
  experienceYears: Number(f.experienceYears) || 0, workplace: f.workplace.trim(), languages: f.languages, consultations,
});

export const meetLinkBad = (v: string) => !!v && !/^https:\/\/\S+$/.test(v.trim());
export const phoneBad = (v: string) => !!v && !/^(\+?88)?01[3-9]\d{8}$/.test(v.replace(/[\s-]/g, ''));

type Set = <K extends keyof ProfileForm>(k: K, v: ProfileForm[K]) => void;

/** A round photo with a camera badge. Uploads straight to storage; falls back to a pasted link when uploads are off. */
export function PhotoPicker({ me, f, set }: { me: DoctorMe; f: ProfileForm; set: Set }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [linkMode, setLinkMode] = useState(false);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const el = e.target;
    const file = el.files?.[0];
    el.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return toast('Choose a JPG, PNG or WebP photo', 'bad');
    if (file.size > 5 * 1024 * 1024) return toast('Choose a photo under 5 MB', 'bad');
    setUploading(true);
    try {
      const { url, publicUrl } = await api.post<{ url: string; publicUrl: string }>('/doctor/photo-upload', { contentType: file.type });
      const put = await fetch(url, { method: 'PUT', headers: { 'content-type': file.type }, body: file });
      if (!put.ok) throw new Error('The upload failed. Please try again.');
      set('photoUrl', publicUrl);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'IMAGES_NOT_CONFIGURED') {
        setLinkMode(true);
        toast('Photo uploads are not set up yet. Paste a link to your photo instead.');
      } else toast(message(err), 'bad');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="ob-photo">
      <button type="button" className="ob-photo-btn" onClick={() => input.current?.click()} disabled={uploading} aria-label="Change photo">
        <DoctorPhoto d={{ id: me.id, name: f.name || me.user.name, photoUrl: f.photoUrl }} size={104} ring />
        <span className="ob-photo-badge" aria-hidden="true">{uploading ? <span className="spin" /> : '📷'}</span>
      </button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => void pick(e)} />
      <span className="muted small" style={{ textAlign: 'center' }}>
        A clear, friendly headshot helps patients trust you.
        {' '}
        {f.photoUrl ? <button type="button" className="linkish" onClick={() => set('photoUrl', '')}>Remove</button> : null}
        {!linkMode ? <> · <button type="button" className="linkish" onClick={() => setLinkMode(true)}>Use a link</button></> : null}
      </span>
      {linkMode ? (
        <input className="input" inputMode="url" placeholder="https://…/photo.jpg" value={f.photoUrl} onChange={(e) => set('photoUrl', e.target.value)} />
      ) : null}
    </div>
  );
}

export function AboutFields({ f, set }: { f: ProfileForm; set: Set }) {
  const toggle = (l: string) => set('languages', f.languages.includes(l) ? f.languages.filter((x) => x !== l) : [...f.languages, l].slice(0, 8));
  return (
    <>
      <label className="field">
        <span>Name patients see</span>
        <input className="input" value={f.name} maxLength={80} autoComplete="name" placeholder="Dr. Ayesha Rahman" onChange={(e) => set('name', e.target.value)} />
      </label>
      <label className="field">
        <span>Qualifications</span>
        <input className="input" value={f.qualifications} maxLength={160} placeholder="MBBS, FCPS (Medicine)" onChange={(e) => set('qualifications', e.target.value)} />
      </label>
      <div className="ob-two">
        <label className="field">
          <span>Years of practice</span>
          <input className="input" inputMode="numeric" value={f.experienceYears} placeholder="8" onChange={(e) => set('experienceYears', e.target.value.replace(/\D/g, '').slice(0, 2))} />
        </label>
        <label className="field">
          <span>Hospital or clinic</span>
          <input className="input" value={f.workplace} maxLength={120} placeholder="Dhaka Medical College" onChange={(e) => set('workplace', e.target.value)} />
        </label>
      </div>
      <div className="field">
        <span>Languages you consult in</span>
        <div className="ob-langs" role="group" aria-label="Languages">
          {LANGUAGES.map((l) => (
            <button key={l} type="button" aria-pressed={f.languages.includes(l)} className={`ob-lang${f.languages.includes(l) ? ' on' : ''}`} onClick={() => toggle(l)}>
              {f.languages.includes(l) ? '✓ ' : ''}{l}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>About you</span>
        <textarea className="input" rows={5} maxLength={1000} value={f.bio} placeholder="What you treat, how you work with patients, anything that helps someone choose you." onChange={(e) => set('bio', e.target.value)} />
        <span className={`small ${f.bio.trim().length < 30 ? 'muted' : 'ok-text'}`}>
          {f.bio.trim().length < 30 ? `${30 - f.bio.trim().length} more characters to go` : '✓ Looks good'} · {f.bio.length}/1000
        </span>
      </label>
    </>
  );
}

export function CallFields({ me, f, set }: { me: DoctorMe; f: ProfileForm; set: Set }) {
  return (
    <>
      {me.channels.includes('GOOGLE_MEET') ? (
        <label className="field">
          <span>🎥 Google Meet room</span>
          <input className="input" inputMode="url" placeholder="https://meet.google.com/abc-defg-hij" value={f.meetLink} onChange={(e) => set('meetLink', e.target.value)} />
          {meetLinkBad(f.meetLink) ? (
            <span className="error small">Must be a link that starts with https://</span>
          ) : (
            <span className="muted small">
              Create one permanent room at <a href="https://meet.google.com/" target="_blank" rel="noreferrer">meet.google.com</a> → New meeting → Create a meeting for later, then paste it here. Every patient joins the same room at their time.
            </span>
          )}
        </label>
      ) : null}
      {me.channels.includes('WHATSAPP') ? (
        <label className="field">
          <span>📞 WhatsApp number</span>
          <input className="input" inputMode="tel" placeholder="+8801XXXXXXXXX" value={f.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} />
          {phoneBad(f.whatsapp) ? <span className="error small">Enter a Bangladeshi mobile number</span> : <span className="muted small">You call the patient from this number at the booked time.</span>}
        </label>
      ) : null}
    </>
  );
}
