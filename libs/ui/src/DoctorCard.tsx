'use client';

import { type ReactNode, useState } from 'react';
import { initials } from './format.js';

export type DoctorChannel = 'GOOGLE_MEET' | 'WHATSAPP';

/** The public face of a doctor: what the store shows and what a doctor previews of themselves. */
export interface DoctorPublic {
  id: string;
  name: string;
  specialty: string;
  bmdcNo: string;
  channels: DoctorChannel[];
  bio?: string | null;
  photoUrl?: string | null;
  qualifications?: string | null;
  experienceYears?: number | null;
  workplace?: string | null;
  languages?: string[] | null;
  consultations?: number;
}

export const DOCTOR_CHANNEL: Record<DoctorChannel, { label: string; short: string; hint: string; icon: string }> = {
  GOOGLE_MEET: { label: 'Video call', short: 'Video', hint: 'Google Meet link, no app needed', icon: '🎥' },
  WHATSAPP: { label: 'WhatsApp call', short: 'WhatsApp', hint: 'The doctor calls your number', icon: '📞' },
};

/** A stable soft colour per doctor so initials avatars are easy to tell apart. */
export function doctorHue(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/** "Dr. Ayesha Rahman" → "AR" (the title is not an initial). */
const docInitials = (name: string) => initials(name.replace(/^Dr\.?\s*/i, ''));

/** Photo when there is one (and it loads), soft-coloured initials otherwise. */
export function DoctorPhoto({ d, size = 56, ring = false }: { d: Pick<DoctorPublic, 'id' | 'name' | 'photoUrl'>; size?: number; ring?: boolean }) {
  const [broken, setBroken] = useState<string | null>(null);
  const h = doctorHue(d.id || d.name);
  const style = { width: size, height: size, fontSize: size * 0.36 };
  const cls = `dc-photo${ring ? ' ring' : ''}`;
  if (d.photoUrl && broken !== d.photoUrl) {
    return (
      <span className={cls} style={style} aria-hidden="true">
        <img src={d.photoUrl} alt="" loading="lazy" decoding="async" onError={() => setBroken(d.photoUrl ?? null)} />
      </span>
    );
  }
  return (
    <span className={cls} style={{ ...style, background: `hsl(${h} 42% 88%)`, color: `hsl(${h} 45% 26%)` }} aria-hidden="true">
      {docInitials(d.name || '?')}
    </span>
  );
}

function facts(d: DoctorPublic) {
  const out: string[] = [];
  if (d.experienceYears) out.push(`${d.experienceYears} yr${d.experienceYears === 1 ? '' : 's'} experience`);
  if (d.consultations) out.push(`${d.consultations} consult${d.consultations === 1 ? '' : 's'}`);
  if (d.languages?.length) out.push(d.languages.join(', '));
  return out;
}

/**
 * The doctor card in the store list. `footer` carries the booking row (next free time, fee, Book),
 * so the same card works as a doctor's "how patients see you" preview.
 */
export function DoctorCard({ d, onOpen, footer, className = '' }: { d: DoctorPublic; onOpen?: () => void; footer?: ReactNode; className?: string }) {
  const head = (
    <>
      <DoctorPhoto d={d} size={64} />
      <span className="dc-head-text">
        <strong className="dc-name">{d.name || 'Your name'}</strong>
        <span className="dc-spec">{d.specialty}</span>
        {d.qualifications ? <span className="dc-qual">{d.qualifications}</span> : null}
        <span className="dc-verified" title="Verified with the Bangladesh Medical & Dental Council">
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><circle cx="8" cy="8" r="8" fill="currentColor" /><path d="M4.6 8.2l2.2 2.2 4.6-4.6" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          BMDC {d.bmdcNo}
        </span>
      </span>
    </>
  );
  const f = facts(d);
  return (
    <article className={`dc-card ${className}`}>
      {onOpen ? <button type="button" className="dc-head" onClick={onOpen}>{head}</button> : <div className="dc-head">{head}</div>}
      {d.workplace ? <p className="dc-work"><span aria-hidden="true">🏥</span> {d.workplace}</p> : null}
      {f.length ? (
        <ul className="dc-facts">
          {f.map((x) => <li key={x}>{x}</li>)}
        </ul>
      ) : null}
      {d.bio ? <p className="dc-bio">{d.bio}</p> : null}
      <div className="dc-channels">
        {d.channels.map((c) => <span key={c} className="dc-chip">{DOCTOR_CHANNEL[c].icon} {DOCTOR_CHANNEL[c].short}</span>)}
      </div>
      {footer ? <div className="dc-foot">{footer}</div> : null}
    </article>
  );
}

/** The full profile a patient opens before booking. `action` is the booking area under it. */
export function DoctorProfileView({ d, action }: { d: DoctorPublic; action?: ReactNode }) {
  const stats = [
    { k: 'Experience', v: d.experienceYears ? `${d.experienceYears} yr${d.experienceYears === 1 ? '' : 's'}` : '—' },
    { k: 'Consults', v: d.consultations ? String(d.consultations) : 'New' },
    { k: 'Speaks', v: d.languages?.length ? d.languages.slice(0, 2).join(', ') : '—' },
  ];
  return (
    <div className="dp-view">
      <div className="dp-hero">
        <DoctorPhoto d={d} size={96} ring />
        <strong className="dp-name">{d.name || 'Your name'}</strong>
        <span className="dc-spec">{d.specialty}</span>
        {d.qualifications ? <span className="dc-qual">{d.qualifications}</span> : null}
        <span className="dc-verified">✓ BMDC {d.bmdcNo} · verified by BarakaBari</span>
      </div>
      <div className="dp-stats">
        {stats.map((s) => (
          <div key={s.k}><strong>{s.v}</strong><span>{s.k}</span></div>
        ))}
      </div>
      {d.bio ? (
        <section className="dp-sec">
          <h3>About</h3>
          <p>{d.bio}</p>
        </section>
      ) : null}
      {d.workplace ? (
        <section className="dp-sec">
          <h3>Practises at</h3>
          <p>🏥 {d.workplace}</p>
        </section>
      ) : null}
      <section className="dp-sec">
        <h3>Consults by</h3>
        <div className="dp-channels">
          {d.channels.map((c) => (
            <div key={c} className="dp-channel">
              <span aria-hidden="true">{DOCTOR_CHANNEL[c].icon}</span>
              <span><strong>{DOCTOR_CHANNEL[c].label}</strong><small>{DOCTOR_CHANNEL[c].hint}</small></span>
            </div>
          ))}
        </div>
      </section>
      {action ? <div className="dp-action">{action}</div> : null}
    </div>
  );
}
