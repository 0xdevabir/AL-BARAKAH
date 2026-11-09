'use client';

import { formatTk } from '@albarakah/domain';
import {
  confirmAction, DoctorPhoto, EmptyState, fmtWhen, initials, invalidate, LargeTitle, promptText, SearchField, Segmented, Sheet, SkeletonList, StatTile, Switch, toast,
} from '@albarakah/ui';
import { useDeferredValue, useState } from 'react';
import { Icon } from '@/components/Icon';
import { api, useApi, useGet } from '@/lib/api';
import { message, poishaToTk, telLink, tkToPoisha } from '@/lib/app';
import { CHANNEL, type Channel } from '@/lib/doctor';
import type { Ledger, RiderOption } from '@/lib/types';

interface Staff { id: string; phone: string; name: string; role: 'ADMIN' | 'RIDER' | 'DOCTOR'; isActive: boolean; totpEnabled: boolean }
interface DoctorRow {
  id: string; bmdcNo: string; specialty: string; feePoisha: number | null; channels: Channel[]; isActive: boolean;
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

function AddDoctor({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ name: '', phone: '', bmdcNo: '', specialty: '', bio: '', fee: '', meet: true, wa: false, meetLink: '', whatsapp: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const channels = [...(f.meet ? ['GOOGLE_MEET'] : []), ...(f.wa ? ['WHATSAPP'] : [])];
    if (!channels.length) return toast('Pick at least one channel', 'bad');
    const feePoisha = f.fee ? tkToPoisha(f.fee) : undefined;
    if (feePoisha === null) return toast('Enter the fee like 500', 'bad');
    setBusy(true);
    try {
      await api.post('/admin/doctors', {
        name: f.name, phone: f.phone, bmdcNo: f.bmdcNo, specialty: f.specialty, bio: f.bio, channels,
        ...(feePoisha !== undefined ? { feePoisha } : {}),
        ...(f.meet && f.meetLink ? { meetLink: f.meetLink } : {}),
        ...(f.wa && f.whatsapp ? { whatsapp: f.whatsapp } : {}),
      });
      toast(`Dr ${f.name} onboarded`);
      invalidate('/admin/doctors');
      invalidate('/admin/staff');
      onDone();
    } catch (err) {
      toast(message(err), 'bad');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form-grid two" onSubmit={(e) => void submit(e)}>
      <label className="field span">Full name<input className="input" required value={f.name} onChange={set('name')} /></label>
      <label className="field">Mobile number<input className="input" inputMode="tel" required value={f.phone} onChange={set('phone')} /></label>
      <label className="field">BMDC no.<input className="input" required value={f.bmdcNo} onChange={set('bmdcNo')} /></label>
      <label className="field">Specialty<input className="input" required placeholder="Medicine" value={f.specialty} onChange={set('specialty')} /></label>
      <label className="field">Fee (Tk)<small>Blank = store default</small><input className="input" inputMode="decimal" value={f.fee} onChange={set('fee')} /></label>
      <label className="field span">Short bio<textarea className="input" value={f.bio} onChange={set('bio')} /></label>
      <div className="group span">
        <div><span className="grow">Google Meet</span><Switch label="Google Meet" checked={f.meet} onChange={(v) => setF({ ...f, meet: v })} /></div>
        {f.meet ? <div><input className="input" type="url" required placeholder="https://meet.google.com/…" value={f.meetLink} onChange={set('meetLink')} /></div> : null}
        <div><span className="grow">WhatsApp</span><Switch label="WhatsApp" checked={f.wa} onChange={(v) => setF({ ...f, wa: v })} /></div>
        {f.wa ? <div><input className="input" inputMode="tel" required placeholder="WhatsApp number" value={f.whatsapp} onChange={set('whatsapp')} /></div> : null}
      </div>
      <button className="btn primary block span" disabled={busy}>{busy ? 'Saving…' : 'Onboard doctor'}</button>
    </form>
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
