'use client';

import { formatTk } from '@albarakah/domain';
import {
  confirmAction, DoctorPhoto, EmptyState, fmtWhen, initials, invalidate, LargeTitle, promptText, SearchField, Segmented, Sheet, SkeletonList, StatTile, Switch, toast,
} from '@albarakah/ui';
import Link from 'next/link';
import { useDeferredValue, useState } from 'react';
import { Icon } from '@/components/Icon';
import { api, useApi, useGet } from '@/lib/api';
import { message, poishaToTk, telLink, tkToPoisha } from '@/lib/app';
import { CHANNEL, type Channel, TIER, type Tier } from '@/lib/doctor';
import type { Ledger, RiderOption } from '@/lib/types';

interface Staff { id: string; phone: string; name: string; role: 'ADMIN' | 'RIDER' | 'DOCTOR'; isActive: boolean; totpEnabled: boolean }
interface DoctorRow {
  id: string; bmdcNo: string; specialty: string; feePoisha: number | null; channels: Channel[]; isActive: boolean; tier: Tier;
  photoUrl: string | null; qualifications: string | null; onboardedAt: string | null; createdAt?: string;
  user: { name: string; phone: string; email: string | null; isActive: boolean };
  availability: { id: string }[]; _count: { consultations: number };
}
interface Invite {
  id: string; email: string; name: string; bmdcNo: string; specialty: string; feePoisha: number | null; channels: Channel[];
  expiresAt: string; sentCount: number; lastSentAt: string | null; createdAt: string;
  invitedBy: { name: string } | null; status: 'PENDING' | 'EXPIRED' | 'ACCEPTED' | 'REVOKED';
}
interface InviteSent { id: string; link: string; emailed: boolean; consoleEmail: boolean }
type DoctorStage = 'setup' | 'live' | 'hidden';
const stageOf = (d: DoctorRow): DoctorStage => (!d.onboardedAt ? 'setup' : d.isActive && d.user.isActive ? 'live' : 'hidden');
const STAGE_LABEL: Record<DoctorStage, string> = { setup: 'Setting up', live: 'Live', hidden: 'Hidden' };

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Link copied');
  } catch {
    toast('Couldn’t copy. Select the link and copy it by hand.', 'bad');
  }
}
type View = 'RIDER' | 'DOCTOR' | 'ADMIN';

const LEDGER_LABEL = { EARNING: 'Delivery earning', COD_COLLECTED: 'Cash collected', SETTLEMENT: 'Settled with office' } as const;

export default function TeamPage() {
  const { user } = useApi();
  const [view, setView] = useState<View>('RIDER');
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q.trim().toLowerCase());
  const [adding, setAdding] = useState<View | null>(null);
  const [rider, setRider] = useState<Staff | null>(null);

  const { data: staff, pending } = useGet<Staff[]>('/admin/staff');
  const { data: riders } = useGet<RiderOption[]>('/admin/riders', { pollMs: 30_000 });
  const { data: doctors } = useGet<DoctorRow[]>('/admin/doctors');
  const { data: invites } = useGet<Invite[]>(view === 'DOCTOR' ? '/admin/doctors/invites' : null);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const openDoctor = (doctors ?? []).find((d) => d.id === doctorId) ?? null;

  const match = (s: string) => !dq || s.toLowerCase().includes(dq);
  const list = (staff ?? []).filter((s) => s.role === view && (match(s.name) || match(s.phone)));
  const docs = (doctors ?? []).filter((d) => match(d.user.name) || match(d.specialty) || match(d.user.phone) || match(d.bmdcNo));
  const invs = (invites ?? []).filter((i) => match(i.name) || match(i.email) || match(i.specialty));
  const load = new Map((riders ?? []).map((r) => [r.id, r]));
  const onlineCount = (riders ?? []).filter((r) => r.online).length;

  async function toggleStaff(s: Staff, isActive: boolean) {
    if (!isActive && !(await confirmAction({ title: `Disable ${s.name}?`, message: 'They are signed out everywhere and cannot sign back in.', confirm: 'Disable', destructive: true }))) return;
    try {
      await api.patch(`/admin/staff/${s.id}/active`, { isActive });
      toast(isActive ? `${s.name} enabled` : `${s.name} disabled`);
      invalidate('/admin/staff');
      invalidate('/admin/riders');
      invalidate('/admin/doctors');
    } catch (err) {
      toast(message(err), 'bad');
    }
  }
  async function toggleDoctor(d: DoctorRow, isActive: boolean) {
    try {
      await api.patch(`/admin/doctors/${d.id}/active`, { isActive });
      toast(isActive ? `${d.user.name} is bookable` : `${d.user.name} hidden from booking`);
      invalidate('/admin/doctors');
    } catch (err) {
      toast(message(err), 'bad');
    }
  }

  return (
    <>
      <LargeTitle
        sub={`${onlineCount} riders on shift`}
        action={
          <button className="btn small primary" onClick={() => setAdding(view)}>
            <Icon name="plus" size={16} /> Add
          </button>
        }
      >
        Team
      </LargeTitle>
      <div className="toolbar">
        <Segmented<View>
          label="Role"
          value={view}
          onChange={setView}
          options={[
            { value: 'RIDER', label: 'Riders' },
            { value: 'DOCTOR', label: 'Doctors' },
            { value: 'ADMIN', label: 'Admins' },
          ]}
        />
        <SearchField value={q} onChange={setQ} placeholder="Name or phone" />
      </div>

      {pending ? <SkeletonList rows={5} /> : null}

      {view === 'DOCTOR' ? (
        docs.length || invs.length ? (
          <DoctorsView docs={docs} invites={invs} onOpen={(d) => setDoctorId(d.id)} onToggle={(d, v) => void toggleDoctor(d, v)} />
        ) : doctors ? (
          <EmptyState
            icon="🩺"
            title={dq ? 'No matches' : 'No doctors yet'}
            action={dq ? undefined : <button className="btn primary" onClick={() => setAdding('DOCTOR')}>Invite a doctor</button>}
          >
            {dq ? null : 'Invite a doctor by email. They set up their own account, profile and hours.'}
          </EmptyState>
        ) : null
      ) : list.length ? (
        <div className="group cv">
          {list.map((s) => {
            const r = load.get(s.id);
            const row = (
              <>
                <span className="avatar">
                  {initials(s.name)}
                  {s.role === 'RIDER' ? <span className={`presence${r?.online ? ' on' : ''}`} /> : null}
                </span>
                <span className="cell-main">
                  <strong>{s.name}{s.id === user?.id ? ' (you)' : ''}</strong>
                  <span className="cell-sub">
                    {s.phone}
                    {s.role === 'RIDER' && r ? ` · ${r.online ? 'On shift' : 'Off shift'} · ${r.activeJobs} active` : ''}
                    {s.role === 'ADMIN' ? (s.totpEnabled ? ' · 2FA on' : ' · 2FA not set up') : ''}
                  </span>
                </span>
              </>
            );
            return (
              <div key={s.id}>
                {s.role === 'RIDER' ? (
                  <button className="row grow bare-btn" onClick={() => setRider(s)}>{row}</button>
                ) : (
                  <span className="row grow">{row}</span>
                )}
                {s.id !== user?.id ? <Switch label={`${s.name} active`} checked={s.isActive} onChange={(v) => void toggleStaff(s, v)} /> : null}
              </div>
            );
          })}
        </div>
      ) : staff ? (
        <EmptyState icon="👤" title={dq ? 'No matches' : `No ${view === 'RIDER' ? 'riders' : 'admins'} yet`} />
      ) : null}

      <Sheet open={!!adding} onClose={() => setAdding(null)} title={adding === 'DOCTOR' ? 'Invite a doctor' : adding === 'ADMIN' ? 'Add an admin' : 'Add a rider'}>
        {adding === 'DOCTOR' ? <InviteDoctor onDone={() => setAdding(null)} /> : adding ? <AddStaff role={adding} onDone={() => setAdding(null)} /> : null}
      </Sheet>
      <Sheet open={!!openDoctor} onClose={() => setDoctorId(null)} title={openDoctor?.user.name ?? 'Doctor'}>
        {openDoctor ? <DoctorDetail key={openDoctor.id} d={openDoctor} onToggle={(v) => void toggleDoctor(openDoctor, v)} /> : null}
      </Sheet>
      <Sheet open={!!rider} onClose={() => setRider(null)} title={rider?.name ?? 'Rider'}>
        {rider ? <RiderLedger rider={rider} /> : null}
      </Sheet>
    </>
  );
}

function AddStaff({ role, onDone }: { role: 'ADMIN' | 'RIDER'; onDone: () => void }) {
  const [f, setF] = useState({ name: '', phone: '' });
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/admin/staff', { ...f, role });
      toast(`${f.name} added. They sign in with ${f.phone}.`);
      invalidate('/admin/staff');
      invalidate('/admin/riders');
      onDone();
    } catch (err) {
      toast(message(err), 'bad');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="stack" onSubmit={(e) => void submit(e)}>
      <label className="field">Full name<input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <label className="field">Mobile number<input className="input" inputMode="tel" required placeholder="01712 345678" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
      {role === 'ADMIN' ? <p className="muted small">New admins set up an authenticator app the first time they sign in.</p> : null}
      <button className="btn primary block" disabled={busy}>{busy ? 'Adding…' : 'Add'}</button>
    </form>
  );
}

const CHANNELS: Channel[] = ['GOOGLE_MEET', 'WHATSAPP'];

/** The doctor pipeline: open invitations first, then everyone who has an account, grouped by stage. */
function DoctorsView({ docs, invites, onOpen, onToggle }: {
  docs: DoctorRow[]; invites: Invite[]; onOpen: (d: DoctorRow) => void; onToggle: (d: DoctorRow, v: boolean) => void;
}) {
  const by = (s: DoctorStage) => docs.filter((d) => stageOf(d) === s);
  const live = by('live');
  const setup = by('setup');
  const hidden = by('hidden');
  const pending = invites.filter((i) => i.status === 'PENDING').length;
  const group = (label: string, rows: DoctorRow[]) =>
    rows.length ? (
      <>
        <p className="group-label">{label} · {rows.length}</p>
        <div className="group cv">
          {rows.map((d) => <DoctorItem key={d.id} d={d} onOpen={() => onOpen(d)} onToggle={(v) => onToggle(d, v)} />)}
        </div>
      </>
    ) : null;
  return (
    <div className="stack">
      <div className="stats">
        <StatTile label="Live" value={String(live.length)} />
        <StatTile label="Setting up" value={String(setup.length)} tone={setup.length ? 'warn' : undefined} />
        <StatTile label="Invited" value={String(pending)} />
        <StatTile label="Hidden" value={String(hidden.length)} />
      </div>
      {invites.length ? (
        <>
          <p className="group-label">Invitations · {invites.length}</p>
          <div className="group cv">
            {invites.map((i) => <InviteItem key={i.id} i={i} />)}
          </div>
        </>
      ) : null}
      {group('Setting up', setup)}
      {group('Live', live)}
      {group('Hidden', hidden)}
    </div>
  );
}

function DoctorItem({ d, onOpen, onToggle }: { d: DoctorRow; onOpen: () => void; onToggle: (v: boolean) => void }) {
  const stage = stageOf(d);
  return (
    <div>
      <button className="row grow bare-btn" onClick={onOpen}>
        <DoctorPhoto d={{ id: d.id, name: d.user.name, photoUrl: d.photoUrl }} size={40} />
        <span className="cell-main">
          <strong>{d.user.name}</strong>
          <span className="cell-sub">
            {d.tier === 'INTERN' ? 'Duty doctor · ' : ''}{d.specialty} · BMDC {d.bmdcNo}
            {stage === 'setup' ? ` · ${d.availability.length ? 'hours set' : 'no hours yet'}` : ` · ${d._count.consultations} consults`}
          </span>
        </span>
        <span className={`inv-badge ${stage}`}>{STAGE_LABEL[stage]}</span>
      </button>
      {stage !== 'setup' ? <Switch label={`${d.user.name} bookable`} checked={d.isActive} onChange={onToggle} /> : null}
    </div>
  );
}

function InviteItem({ i }: { i: Invite }) {
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const expired = i.status === 'EXPIRED';
  const refresh = () => invalidate('/admin/doctors/invites');

  async function resend() {
    setBusy(true);
    try {
      const r = await api.post<InviteSent>(`/admin/doctors/invites/${i.id}/resend`);
      setLink(r.link);
      toast(r.emailed && !r.consoleEmail ? `New invitation emailed to ${i.email}` : 'New link ready. Copy it and send it to the doctor.');
      refresh();
    } catch (err) {
      toast(message(err), 'bad');
    } finally {
      setBusy(false);
    }
  }
  async function revoke() {
    if (!(await confirmAction({ title: `Cancel ${i.name}’s invitation?`, message: 'The link stops working straight away. You can invite them again later.', confirm: 'Cancel invitation', destructive: true }))) return;
    setBusy(true);
    try {
      await api.del(`/admin/doctors/invites/${i.id}`);
      toast('Invitation cancelled');
      refresh();
    } catch (err) {
      toast(message(err), 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ alignItems: 'stretch', gap: 8 }}>
      <div className="inv-row">
        <span className="avatar">{initials(i.name)}</span>
        <span className="cell-main">
          <strong>{i.name}</strong>
          <span className="cell-sub">
            {i.email} · {i.specialty}
            {' · '}
            {expired ? `expired ${fmtWhen(i.expiresAt)}` : `sent ${i.sentCount}× · until ${fmtWhen(i.expiresAt)}`}
          </span>
        </span>
        <span className={`inv-badge ${expired ? 'expired' : 'pending'}`}>{expired ? 'Expired' : 'Invited'}</span>
      </div>
      {link ? (
        <div className="inv-link">
          <span className="grow mono">{link}</span>
          <button type="button" className="btn small" onClick={() => void copy(link)}>Copy</button>
        </div>
      ) : null}
      <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn ghost small" disabled={busy} onClick={() => void revoke()}>Cancel</button>
        <button type="button" className="btn small" disabled={busy} onClick={() => void resend()}>{expired ? 'Send a new link' : 'Resend'}</button>
      </div>
    </div>
  );
}

function TierPicker({ value, onChange }: { value: Tier; onChange: (v: Tier) => void }) {
  return (
    <label className="field span">Doctor type
      <select className="input" value={value} onChange={(e) => onChange(e.target.value as Tier)}>
        <option value="SPECIALIST">{TIER.SPECIALIST} — booked in daily 2–4 hour slots</option>
        <option value="INTERN">{TIER.INTERN} — takes instant prepaid video calls</option>
      </select>
    </label>
  );
}

function ChannelPicker({ value, onChange }: { value: Channel[]; onChange: (v: Channel[]) => void }) {
  return (
    <div className="group span">
      {CHANNELS.map((c) => (
        <div key={c}>
          <span className="grow">{CHANNEL[c]}</span>
          <Switch label={CHANNEL[c]} checked={value.includes(c)} onChange={(on) => onChange(on ? [...value, c] : value.filter((x) => x !== c))} />
        </div>
      ))}
    </div>
  );
}

/** Superadmins invite by email. The doctor confirms their own phone and fills in their own profile. */
function InviteDoctor({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ email: '', name: '', bmdcNo: '', specialty: '', fee: '' });
  const [channels, setChannels] = useState<Channel[]>(['GOOGLE_MEET']);
  const [tier, setTier] = useState<Tier>('SPECIALIST');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<(InviteSent & { email: string; name: string }) | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!channels.length) return toast('Pick at least one way to consult', 'bad');
    const feePoisha = f.fee.trim() ? tkToPoisha(f.fee) : undefined;
    if (feePoisha === null) return toast('Enter the fee like 500', 'bad');
    setBusy(true);
    try {
      const r = await api.post<InviteSent>('/admin/doctors/invites', {
        email: f.email.trim(), name: f.name.trim(), bmdcNo: f.bmdcNo.trim(), specialty: f.specialty.trim(), channels, tier,
        ...(feePoisha !== undefined ? { feePoisha } : {}),
      });
      setSent({ ...r, email: f.email.trim(), name: f.name.trim() });
      invalidate('/admin/doctors/invites');
    } catch (err) {
      toast(message(err), 'bad');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    const mailed = sent.emailed && !sent.consoleEmail;
    return (
      <div className="stack">
        <div className="join-hero">
          <span style={{ fontSize: '2rem' }} aria-hidden="true">{mailed ? '✉️' : '🔗'}</span>
          <strong style={{ fontSize: '1.1rem' }}>{mailed ? `Invitation sent to ${sent.name}` : 'Invitation ready'}</strong>
          <span className="muted small">
            {mailed
              ? `We emailed ${sent.email} a link to set up their account. It works for 7 days.`
              : sent.consoleEmail
                ? 'Email isn’t connected on this server, so nothing was sent. Copy the link and send it to the doctor yourself.'
                : `We couldn’t email ${sent.email}. Copy the link and send it to the doctor yourself.`}
          </span>
        </div>
        <div className="inv-link">
          <span className="grow mono">{sent.link}</span>
          <button type="button" className="btn small" onClick={() => void copy(sent.link)}>Copy</button>
        </div>
        <p className="muted small">Only share this link with the doctor. Anyone who opens it can claim the account.</p>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn ghost grow" onClick={() => { setSent(null); setF({ email: '', name: '', bmdcNo: '', specialty: '', fee: '' }); }}>Invite another</button>
          <button type="button" className="btn primary grow" onClick={onDone}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <form className="form-grid two" onSubmit={(e) => void submit(e)}>
      <p className="muted small span">The doctor gets an email with a link. They confirm their mobile number, add their photo, qualifications and hours, then go live.</p>
      <label className="field span">Email<input className="input" type="email" required autoComplete="off" placeholder="doctor@example.com" value={f.email} onChange={set('email')} /></label>
      <label className="field span">Full name<input className="input" required minLength={2} placeholder="Dr. Ayesha Rahman" value={f.name} onChange={set('name')} /></label>
      <label className="field">BMDC no.<input className="input" required value={f.bmdcNo} onChange={set('bmdcNo')} /></label>
      <label className="field">Specialty<input className="input" required placeholder="Medicine" value={f.specialty} onChange={set('specialty')} /></label>
      <label className="field span">Fee (Tk)<small>Blank = store default</small><input className="input" inputMode="decimal" value={f.fee} onChange={set('fee')} /></label>
      <TierPicker value={tier} onChange={setTier} />
      {tier === 'INTERN' ? <p className="muted small span">Duty doctors are paid per instant call at the instant call fee, not their own fee.</p> : null}
      <p className="group-label span">Consults by</p>
      <ChannelPicker value={channels} onChange={setChannels} />
      <button className="btn primary block span" disabled={busy}>{busy ? 'Sending…' : 'Send invitation'}</button>
    </form>
  );
}

/** What the superadmin controls about a doctor: listing basics and whether patients can book. */
function DoctorDetail({ d, onToggle }: { d: DoctorRow; onToggle: (v: boolean) => void }) {
  const init = { specialty: d.specialty, fee: d.feePoisha !== null ? poishaToTk(d.feePoisha) : '' };
  const [f, setF] = useState(init);
  const [channels, setChannels] = useState<Channel[]>(d.channels);
  const [tier, setTier] = useState<Tier>(d.tier);
  const [busy, setBusy] = useState(false);
  const stage = stageOf(d);
  const dirty = f.specialty !== init.specialty || f.fee !== init.fee || channels.join() !== d.channels.join() || tier !== d.tier;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!channels.length) return toast('Pick at least one way to consult', 'bad');
    const feePoisha = f.fee.trim() ? tkToPoisha(f.fee) : null;
    if (f.fee.trim() && feePoisha === null) return toast('Enter the fee like 500', 'bad');
    setBusy(true);
    try {
      await api.patch(`/admin/doctors/${d.id}`, { specialty: f.specialty.trim(), feePoisha, channels, tier });
      toast('Listing updated');
      invalidate('/admin/doctors');
    } catch (err) {
      toast(message(err), 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="inv-row">
        <DoctorPhoto d={{ id: d.id, name: d.user.name, photoUrl: d.photoUrl }} size={64} ring />
        <span className="cell-main">
          <strong>{d.user.name}</strong>
          <span className="cell-sub">{d.qualifications || 'No qualifications yet'}</span>
        </span>
        <span className={`inv-badge ${stage}`}>{STAGE_LABEL[stage]}</span>
      </div>
      <div className="group">
        <div className="cell"><span className="cell-main"><span>Sign-in number</span></span><a className="mono" href={telLink(d.user.phone)}>{d.user.phone}</a></div>
        {d.user.email ? <div className="cell"><span className="cell-main"><span>Email</span></span><span className="small">{d.user.email}</span></div> : null}
        <div className="cell"><span className="cell-main"><span>BMDC number</span></span><strong className="mono">{d.bmdcNo}</strong></div>
        <div className="cell"><span className="cell-main"><span>Completed consults</span></span><strong>{d._count.consultations}</strong></div>
        <div className="cell"><span className="cell-main"><span>Hours</span></span><strong>{d.availability.length ? `${d.availability.length} window${d.availability.length === 1 ? '' : 's'}` : 'Not set'}</strong></div>
        {stage === 'setup' ? null : (
          <div className="cell">
            <span className="cell-main"><span>Bookable by patients</span></span>
            <Switch label="Bookable" checked={d.isActive} onChange={onToggle} />
          </div>
        )}
      </div>
      {stage === 'setup' ? null : (
        <Link className="btn block" href={`/admin/doctors/${d.id}`}>
          <Icon name="stetho" size={18} /> View their portal (read-only)
        </Link>
      )}
      {stage === 'setup' ? <p className="muted small">{d.user.name} has an account and is still finishing their profile. They appear in the app once they go live.</p> : null}

      <form className="form-grid two" onSubmit={(e) => void save(e)}>
        <p className="group-label span">Listing</p>
        <label className="field">Specialty<input className="input" required value={f.specialty} onChange={(e) => setF({ ...f, specialty: e.target.value })} /></label>
        <label className="field">Fee (Tk)<small>Blank = store default</small><input className="input" inputMode="decimal" value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} /></label>
        <TierPicker value={tier} onChange={setTier} />
        <ChannelPicker value={channels} onChange={setChannels} />
        {channels.some((c) => !d.channels.includes(c)) && stage !== 'setup' ? (
          <p className="muted small span">The doctor needs to add the call details for the new channel in their profile.</p>
        ) : null}
        <button className="btn primary block span" disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save listing'}</button>
      </form>
    </div>
  );
}

function RiderLedger({ rider }: { rider: Staff }) {
  const { data: l, refetch } = useGet<Ledger>(`/admin/riders/${rider.id}/ledger`, { staleMs: 5_000 });
  async function settle() {
    if (!l) return;
    const amount = await promptText({
      title: 'Record cash handed in',
      message: `${rider.name} is holding ${formatTk(l.cashHeldPoisha)}.`,
      placeholder: 'Amount in Tk',
      initial: poishaToTk(l.cashHeldPoisha),
      confirm: 'Next',
      required: true,
    });
    if (amount === null) return;
    const amountPoisha = tkToPoisha(amount);
    if (!amountPoisha) return toast('Enter an amount like 1500', 'bad');
    const note = await promptText({ title: 'Note (optional)', placeholder: 'e.g. evening drop at office', confirm: `Settle ${formatTk(amountPoisha)}` });
    if (note === null) return;
    try {
      await api.post(`/admin/riders/${rider.id}/settle`, { amountPoisha, note: note || undefined });
      toast(`${formatTk(amountPoisha)} settled`);
      invalidate('/admin/dashboard');
      await refetch();
    } catch (err) {
      toast(message(err), 'bad');
    }
  }
  if (!l) return <SkeletonList rows={4} />;
  return (
    <div className="stack">
      <div className="stats">
        <StatTile label="Cash held" value={formatTk(l.cashHeldPoisha)} tone={l.cashHeldPoisha > 0 ? 'warn' : undefined} />
        <StatTile label="Earned (all time)" value={formatTk(l.earnedPoisha)} />
        <StatTile label="Collected" value={formatTk(l.codCollectedPoisha)} />
        <StatTile label="Settled" value={formatTk(l.settledPoisha)} />
      </div>
      <div className="actions">
        <button className="btn primary" disabled={l.cashHeldPoisha <= 0} onClick={() => void settle()}>Settle cash</button>
        <a className="btn" href={telLink(rider.phone)}><Icon name="phone" size={18} /> Call</a>
      </div>
      <p className="group-label">Recent entries</p>
      {l.entries.length ? (
        <div className="group">
          {l.entries.map((e) => (
            <div key={e.id}>
              <span className="cell-main">
                <strong>{LEDGER_LABEL[e.type]}{e.order ? ` · ${e.order.code}` : ''}</strong>
                <span className="cell-sub">{fmtWhen(e.createdAt)}{e.note ? ` · ${e.note}` : ''}</span>
              </span>
              <span className={`mono${e.type === 'SETTLEMENT' ? ' muted' : ''}`}>{e.type === 'SETTLEMENT' ? '−' : '+'}{formatTk(e.amountPoisha)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted small">No ledger activity yet.</p>
      )}
    </div>
  );
}
