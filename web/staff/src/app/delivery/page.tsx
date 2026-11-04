'use client';

import { formatTk } from '@albarakah/domain';
import {
  chooseAction, confirmAction, distanceM, EmptyState, etaSeconds, fetchRoute, fmtDistance, fmtDuration, fmtRelative, fmtTime, fmtWeekday,
  haptic, hasPoint, invalidate, LargeTitle, type LatLng, type MapPin, MapView, mutate, navLink, promptText, type Route, Segmented, Sheet,
  SkeletonList, StatTile, statusLabel, statusTone, suggestOrder, Switch, toast,
} from '@albarakah/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { api, useApi, useGet } from '@/lib/api';
import { mapsLink, message, pct, telLink } from '@/lib/app';
import { useLive } from '@/lib/live';
import { type Fix, useRiderFix } from '@/lib/tracking';
import type { AddressSnap } from '@/lib/types';

interface Job {
  id: string; code: string; status: 'ASSIGNED' | 'OUT_FOR_DELIVERY'; type: 'NORMAL' | 'EMERGENCY'; promisedBy: string;
  slotStart: string | null; slotEnd: string | null; addressSnapshot: AddressSnap; totalPoisha: number; paymentMethod: 'COD' | 'BKASH';
  paymentStatus: string; riderPayoutPoisha: number; notes: string | null; updatedAt: string;
  customer: { name: string }; items: { nameSnapshot: string; qty: number }[];
}
interface Summary {
  online: boolean; active: number; deliveredToday: number; failedToday: number; earnedTodayPoisha: number;
  week: { date: string; poisha: number }[]; cashHeldPoisha: number; rating: number | null; ratingCount: number; onTimeRate: number | null;
}
interface Pickup { lat: number; lng: number; address: string }

/** A job plus where it is on the map and how far away. */
interface Stop {
  job: Job;
  point: LatLng | null;
  /** 1-based position in the suggested visiting order. */
  n: number;
  /** Straight-line metres from the rider, via the pharmacy if not picked up yet. */
  meters: number | null;
}

const FAIL_REASONS = ['Customer not reachable', 'Customer not at address', 'Wrong or incomplete address', 'Customer refused the order', 'Customer could not pay'];
const VIEW_KEY = 'rider:view';

/** Ticks twice a minute so countdowns stay honest without re-rendering every second. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const jobPoint = (j: Job): LatLng | null => (hasPoint(j.addressSnapshot) ? { lat: j.addressSnapshot.lat!, lng: j.addressSnapshot.lng! } : null);

function buildStops(jobs: Job[], origin: LatLng, pickup: LatLng | null): Stop[] {
  const raw = jobs.map((job) => ({ job, point: jobPoint(job) }));
  // Picked-up parcels go first: they are already on the bike.
  const out = raw.filter((s) => s.job.status === 'OUT_FOR_DELIVERY');
  const waiting = raw.filter((s) => s.job.status === 'ASSIGNED');
  const ordered = [...suggestOrder(origin, out), ...suggestOrder(pickup ?? origin, waiting)];
  return ordered.map((s, i) => {
    let meters: number | null = null;
    if (s.point) meters = s.job.status === 'ASSIGNED' && pickup ? distanceM(origin, pickup) + distanceM(pickup, s.point) : distanceM(origin, s.point);
    return { ...s, n: i + 1, meters };
  });
}

export default function RiderToday() {
  const { user } = useApi();
  const { data: jobs, pending } = useGet<Job[]>('/delivery/jobs', { pollMs: 60_000 });
  const { data: s } = useGet<Summary>('/delivery/summary', { pollMs: 120_000 });
  const { data: pickup } = useGet<Pickup>('/delivery/pickup', { staleMs: 10 * 60_000 });
  const { fix, status: gps } = useRiderFix();
  const [open, setOpen] = useState<string | null>(null);
  const [deliver, setDeliver] = useState<Job | null>(null);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [sort, setSort] = useState<'due' | 'route'>('due');
  const now = useNow();

  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === 'map') setView('map');
    } catch {
      /* storage blocked */
    }
  }, []);
  function changeView(v: 'list' | 'map') {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* storage blocked */
    }
  }

  const live = useLive('/delivery/events/ticket', (e) => {
    invalidate('/delivery');
    if (e.status === 'ASSIGNED') {
      haptic('success');
      toast('New job assigned', 'info');
    }
  });

  const pickupPt = pickup ? { lat: pickup.lat, lng: pickup.lng } : null;
  const origin: LatLng | null = fix ?? pickupPt;
  // Re-sort only every ~100 m so cards don't shuffle under the rider's thumb.
  const coarse = fix ? `${fix.lat.toFixed(3)},${fix.lng.toFixed(3)}` : 'none';
  const stops = useMemo(
    () => (jobs && origin ? buildStops(jobs, origin, pickupPt) : (jobs ?? []).map((job, i) => ({ job, point: jobPoint(job), n: i + 1, meters: null }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jobs, coarse, pickup?.lat, pickup?.lng],
  );
  const byId = useMemo(() => new Map(stops.map((x) => [x.job.id, x])), [stops]);
  const listed = sort === 'route' ? stops : (jobs ?? []).map((j) => byId.get(j.id)!).filter(Boolean);
  const openStop = open ? byId.get(open) ?? null : null;

  async function setOnline(online: boolean) {
    mutate<Summary>('/delivery/summary', (prev) => ({ ...(prev as Summary), online }));
    try {
      await api.put('/delivery/online', { online });
      toast(online ? 'You are on shift' : 'You are off shift', 'info');
    } catch (err) {
      toast(message(err), 'bad');
    }
    invalidate('/delivery/summary');
  }

  async function start(j: Job) {
    if (!(await confirmAction({ title: `Picked up ${j.code}?`, message: 'The customer is told you are on the way and can follow you on the map.', confirm: 'Start delivery' }))) return;
    if (await move(j, { to: 'OUT_FOR_DELIVERY' })) haptic('success');
  }

  async function fail(j: Job) {
    const pick = await chooseAction('Why could it not be delivered?', [...FAIL_REASONS.map((r) => ({ label: r, value: r })), { label: 'Something else…', value: '__other' }]);
    if (!pick) return;
    let note = pick;
    if (pick === '__other') {
      const t = await promptText({ title: 'What happened?', placeholder: 'Short reason', confirm: 'Mark failed', required: true, destructive: true });
      if (t === null) return;
      note = t;
    } else if (!(await confirmAction({ title: `Mark ${j.code} failed?`, message: pick, confirm: 'Mark failed', destructive: true }))) return;
    if (await move(j, { to: 'FAILED', note })) setOpen(null);
  }

  async function move(j: Job, body: { to: string; note?: string; code?: string }) {
    try {
      await api.patch(`/delivery/jobs/${j.id}/status`, body);
      toast(`${j.code}: ${statusLabel(body.to)}`);
      invalidate('/delivery');
      return true;
    } catch (err) {
      toast(message(err), 'bad');
      return false;
    }
  }

  function handOver(j: Job) {
    setOpen(null);
    setDeliver(j);
  }

  const max = Math.max(1, ...(s?.week.map((d) => d.poisha) ?? [1]));
  const actions = { start, fail, handOver, open: (j: Job) => setOpen(j.id) };

  return (
    <>
      <LargeTitle
        sub={
          <span className="row" style={{ gap: 8 }}>
            <span className={`live-dot${live ? ' on' : ''}`} /> {user ? `Hi, ${user.name.split(' ')[0]}` : ''}
          </span>
        }
      >
        Today
      </LargeTitle>

      <div className={`shift ${s?.online ? 'on' : ''}`}>
        <span className="grow">
          <strong>{s?.online ? 'On shift' : 'Off shift'}</strong>
          <span className="small" style={{ display: 'block', opacity: 0.85 }}>
            {s?.online ? <GpsLine status={gps} fix={fix} /> : 'Go on shift to receive jobs.'}
          </span>
        </span>
        <Switch label="On shift" checked={!!s?.online} onChange={(v) => void setOnline(v)} disabled={!s} />
      </div>
      {s?.online && gps === 'denied' ? (
        <div className="notice bad small" style={{ marginTop: 10 }}>
          Location is blocked, so customers can’t follow you. Allow location for this site in your browser settings, then reload.
        </div>
      ) : null}

      {s ? (
        <div className="stats" style={{ marginTop: 14 }}>
          <StatTile label="Earned today" value={formatTk(s.earnedTodayPoisha)} />
          <StatTile label="Delivered" value={s.deliveredToday} hint={s.failedToday ? `${s.failedToday} failed` : 'today'} />
          <StatTile label="Cash to hand in" value={formatTk(s.cashHeldPoisha)} tone={s.cashHeldPoisha > 0 ? 'warn' : undefined} />
          <StatTile label="Rating" value={s.rating ? `${s.rating.toFixed(1)} ★` : '—'} hint={s.onTimeRate !== null ? `${pct(s.onTimeRate)} on time` : undefined} />
        </div>
      ) : null}

      <div className="row between" style={{ marginTop: 26, marginBottom: 12 }}>
        <p className="group-label" style={{ margin: 0 }}>Jobs {jobs?.length ? `· ${jobs.length}` : ''}</p>
        <div style={{ width: 170 }}>
          <Segmented label="View" value={view} onChange={changeView} options={[{ value: 'list', label: 'List' }, { value: 'map', label: 'Map' }]} />
        </div>
      </div>

      {pending ? <SkeletonList rows={3} /> : null}
      {jobs && !jobs.length && view === 'list' ? (
        <EmptyState icon="🛵" title="No jobs right now">{s?.online ? 'New jobs appear here the moment they are assigned.' : 'Go on shift to start receiving jobs.'}</EmptyState>
      ) : null}

      {view === 'map' && jobs ? (
        <JobsMap stops={stops} fix={fix} pickup={pickup ?? null} now={now} onOpen={(id) => setOpen(id)} />
      ) : null}

      {view === 'list' && jobs && jobs.length > 1 ? (
        <div className="chips-row" style={{ marginBottom: 12 }}>
          <button type="button" className={`chip ${sort === 'due' ? '' : 'off'}`} onClick={() => setSort('due')}>By due time</button>
          <button type="button" className={`chip ${sort === 'route' ? '' : 'off'}`} onClick={() => setSort('route')}>Best route</button>
        </div>
      ) : null}

      {view === 'list' ? (
        <div className="stack stagger">
          {listed.map((st) => <JobCard key={st.job.id} stop={st} now={now} {...actions} />)}
        </div>
      ) : null}

      {s ? (
        <>
          <p className="group-label">This week</p>
          <div className="panel">
            <div className="week">
              {s.week.map((d) => (
                <div key={d.date} className="week-col" title={formatTk(d.poisha)}>
                  <span className="week-bar" style={{ height: `${Math.max(4, (d.poisha / max) * 100)}%` }} />
                  <span className="muted small">{fmtWeekday(d.date)}</span>
                </div>
              ))}
            </div>
            <p className="muted small" style={{ marginTop: 8 }}>{formatTk(s.week.reduce((n, d) => n + d.poisha, 0))} earned in the last 7 days</p>
          </div>
        </>
      ) : null}

      <Sheet open={!!openStop} onClose={() => setOpen(null)} title={openStop ? `Stop ${openStop.n} · ${openStop.job.code}` : 'Job'}>
        {openStop ? <JobDetail stop={openStop} fix={fix} pickup={pickup ?? null} now={now} {...actions} /> : null}
      </Sheet>

      <Sheet open={!!deliver} onClose={() => setDeliver(null)} title={deliver ? `Hand over ${deliver.code}` : 'Hand over'}>
        {deliver ? (
          <Handover
            job={deliver}
            onSubmit={async (code) => {
              const ok = await move(deliver, { to: 'DELIVERED', code });
              if (ok) {
                haptic('success');
                setDeliver(null);
              }
              return ok;
            }}
          />
        ) : null}
      </Sheet>
    </>
  );
}

function GpsLine({ status, fix }: { status: string; fix: Fix | null }) {
  if (status === 'live' && fix) return <>Sharing live location · ±{Math.round(fix.accuracy)} m</>;
  if (status === 'locating') return <>Finding your location…</>;
  if (status === 'denied') return <>Location blocked — customers can’t see you</>;
  if (status === 'error') return <>GPS unavailable right now</>;
  return <>Admins can assign you new jobs.</>;
}

interface CardActions {
  start: (j: Job) => Promise<void>;
  fail: (j: Job) => Promise<void>;
  handOver: (j: Job) => void;
  open: (j: Job) => void;
}

function dueText(j: Job, now: number) {
  const late = new Date(j.promisedBy).getTime() < now;
  return { late, text: late ? `Late · was due ${fmtTime(j.promisedBy)}` : `Due ${fmtTime(j.promisedBy)} · ${fmtRelative(j.promisedBy, now)}` };
}

function JobCard({ stop, now, start, fail, handOver, open }: { stop: Stop; now: number } & CardActions) {
  const j = stop.job;
  const due = dueText(j, now);
  const cod = j.paymentMethod === 'COD' && j.paymentStatus !== 'PAID';
  const dest = stop.point;
  return (
    <article className={`job${j.type === 'EMERGENCY' ? ' urgent' : ''}`}>
      <header className="row between">
        <span className="row" style={{ gap: 10 }}>
          <span className="stop-n" aria-label={`Stop ${stop.n}`}>{stop.n}</span>
          <strong className="mono">{j.code}</strong>
          {j.type === 'EMERGENCY' ? <span className="chip bad">Emergency</span> : null}
        </span>
        <span className={`chip ${statusTone(j.status)}`}>{j.status === 'ASSIGNED' ? 'Pick up' : statusLabel(j.status)}</span>
      </header>
      <div className={`job-due ${due.late ? 'late' : ''}`}>
        <Icon name="clock" size={16} />
        {due.text}
      </div>
      <button type="button" className="job-addr" onClick={() => open(j)}>
        <Icon name="map" size={18} />
        <span className="grow" style={{ textAlign: 'left' }}>
          <strong>{j.customer.name}{j.addressSnapshot.zone ? ` · ${j.addressSnapshot.zone}` : ''}</strong>
          <span className="cell-sub" style={{ display: 'block' }}>{j.addressSnapshot.line}</span>
          {j.addressSnapshot.notes ? <span className="cell-sub" style={{ display: 'block' }}>“{j.addressSnapshot.notes}”</span> : null}
        </span>
        <span className="job-dist">
          {stop.meters !== null ? (
            <>
              <strong>{fmtDistance(stop.meters)}</strong>
              <small>~{fmtDuration(etaSeconds(stop.meters))}</small>
            </>
          ) : (
            <small>{dest ? 'Map ›' : 'No pin'}</small>
          )}
        </span>
      </button>
      <p className="small muted">{j.items.map((i) => `${i.qty}× ${i.nameSnapshot}`).join(' · ')}</p>
      {j.notes ? <p className="small">Note: {j.notes}</p> : null}
      <div className="job-money">
        {cod ? (
          <span><span className="muted small">Collect cash</span><strong className="price" style={{ display: 'block' }}>{formatTk(j.totalPoisha)}</strong></span>
        ) : (
          <span><span className="muted small">Paid online</span><strong style={{ display: 'block' }}>Nothing to collect</strong></span>
        )}
        <span style={{ textAlign: 'right' }}><span className="muted small">You earn</span><strong style={{ display: 'block' }}>{formatTk(j.riderPayoutPoisha)}</strong></span>
      </div>
      <div className="actions">
        {j.addressSnapshot.phone ? <a className="btn" href={telLink(j.addressSnapshot.phone)} aria-label={`Call ${j.customer.name}`}><Icon name="phone" size={18} /> Call</a> : null}
        <a className="btn" href={dest ? navLink(dest) : mapsLink(j.addressSnapshot.line)} target="_blank" rel="noreferrer"><Icon name="map" size={18} /> Navigate</a>
        {j.status === 'ASSIGNED' ? (
          <button className="btn primary" onClick={() => void start(j)}>Start delivery</button>
        ) : (
          <>
            <button className="btn danger" onClick={() => void fail(j)}>Failed</button>
            <button className="btn primary" onClick={() => handOver(j)}>Delivered</button>
          </>
        )}
      </div>
    </article>
  );
}

/** Full map of the day: pharmacy, every drop numbered in visiting order, and the rider. */
function JobsMap({ stops, fix, pickup, now, onOpen }: { stops: Stop[]; fix: Fix | null; pickup: Pickup | null; now: number; onOpen: (id: string) => void }) {
  const [sel, setSel] = useState<string | null>(stops[0]?.job.id ?? null);
  const rail = useRef<HTMLDivElement>(null);
  const selStop = stops.find((x) => x.job.id === sel) ?? stops[0] ?? null;
  const route = useRoute(selStop, fix, pickup);

  useEffect(() => {
    if (!stops.some((x) => x.job.id === sel)) setSel(stops[0]?.job.id ?? null);
  }, [stops, sel]);

  const pins: MapPin[] = [];
  if (pickup) pins.push({ id: 'store', kind: 'store', point: pickup, title: 'Pharmacy pickup' });
  for (const st of stops) {
    if (!st.point) continue;
    pins.push({
      id: st.job.id, kind: 'job', point: st.point, label: String(st.n), active: st.job.id === selStop?.job.id, muted: !!selStop && st.job.id !== selStop.job.id,
      title: `${st.n}. ${st.job.customer.name}`, onClick: () => select(st.job.id, true),
    });
  }
  if (fix) pins.push({ id: 'me', kind: 'rider', point: fix, heading: fix.heading });

  function select(id: string, scroll: boolean) {
    setSel(id);
    haptic('light');
    if (scroll) rail.current?.querySelector<HTMLElement>(`[data-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }

  // Picking a card by swiping the rail: whichever card is centred wins.
  function onScroll() {
    const el = rail.current;
    if (!el) return;
    const mid = el.scrollLeft + el.clientWidth / 2;
    let best: string | null = null;
    let bestD = Infinity;
    for (const c of el.querySelectorAll<HTMLElement>('[data-id]')) {
      const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid);
      if (d < bestD) {
        bestD = d;
        best = c.dataset.id ?? null;
      }
    }
    if (best && best !== sel) setSel(best);
  }

  const focus = selStop?.point ? [selStop.job.id, ...(fix ? ['me'] : []), ...(selStop.job.status === 'ASSIGNED' && pickup ? ['store'] : [])] : undefined;

  return (
    <div className="rider-map">
      <MapView pins={pins} route={route?.points} routeDashed={route ? !route.routed : false} fitKey={selStop?.job.id ?? 'all'} focus={focus} padBottom={stops.length ? 150 : 0} />
      {route && selStop ? (
        <div className="rider-map-eta">
          <strong>{fmtDuration(route.durationS)}</strong>
          <span>{fmtDistance(route.distanceM)}{selStop.job.status === 'ASSIGNED' ? ' via pharmacy' : ''}</span>
        </div>
      ) : null}
      {!stops.length ? <div className="rider-map-empty">No jobs yet. You’ll see them here the moment they’re assigned.</div> : null}
      {stops.length ? (
        <div className="rider-rail" ref={rail} onScroll={onScroll}>
          {stops.map((st) => {
            const due = dueText(st.job, now);
            return (
              <button type="button" key={st.job.id} data-id={st.job.id} className={`rail-card ${st.job.id === selStop?.job.id ? 'on' : ''}`} onClick={() => (st.job.id === selStop?.job.id ? onOpen(st.job.id) : select(st.job.id, true))}>
                <span className="row" style={{ gap: 10 }}>
                  <span className="stop-n">{st.n}</span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <strong className="ellipsis">{st.job.customer.name}</strong>
                    <small className="ellipsis">{st.job.addressSnapshot.zone ?? st.job.addressSnapshot.line}</small>
                  </span>
                  {st.job.type === 'EMERGENCY' ? <span className="chip bad">SOS</span> : null}
                </span>
                <span className="row between small">
                  <span className={due.late ? 'error' : 'muted'}>{due.late ? 'Late' : `Due ${fmtTime(st.job.promisedBy)}`}</span>
                  <span>{st.meters !== null ? fmtDistance(st.meters) : st.point ? '' : 'No pin'}</span>
                  <span className="rail-open">{st.job.status === 'ASSIGNED' ? 'Pick up ›' : 'Open ›'}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Road route for a stop: rider → (pharmacy if not picked up) → customer. */
function useRoute(stop: Stop | null, fix: Fix | null, pickup: Pickup | null): Route | null {
  const [route, setRoute] = useState<Route | null>(null);
  // Re-route only when the rider has moved ~250 m, to keep the free router happy.
  const from = fix ? `${(Math.round(fix.lat * 400) / 400).toFixed(4)},${(Math.round(fix.lng * 400) / 400).toFixed(4)}` : '';
  const key = stop?.point ? `${stop.job.id}:${stop.job.status}:${from}:${pickup?.lat},${pickup?.lng}` : '';
  useEffect(() => {
    if (!stop?.point) {
      setRoute(null);
      return;
    }
    const pts: LatLng[] = [];
    if (fix) pts.push(fix);
    if (stop.job.status === 'ASSIGNED' && pickup) pts.push(pickup);
    pts.push(stop.point);
    if (pts.length < 2) {
      setRoute(null);
      return;
    }
    const ac = new AbortController();
    void fetchRoute(pts, ac.signal).then((r) => !ac.signal.aborted && setRoute(r));
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return route;
}

function JobDetail({ stop, fix, pickup, now, start, fail, handOver }: { stop: Stop; fix: Fix | null; pickup: Pickup | null; now: number } & CardActions) {
  const j = stop.job;
  const a = j.addressSnapshot;
  const route = useRoute(stop, fix, pickup);
  const due = dueText(j, now);
  const cod = j.paymentMethod === 'COD' && j.paymentStatus !== 'PAID';
  const needsPickup = j.status === 'ASSIGNED';
  const navTo = needsPickup && pickup ? pickup : stop.point;

  const pins: MapPin[] = [];
  if (pickup && needsPickup) pins.push({ id: 'store', kind: 'store', point: pickup });
  if (stop.point) pins.push({ id: 'home', kind: 'home', point: stop.point });
  if (fix) pins.push({ id: 'me', kind: 'rider', point: fix, heading: fix.heading });

  return (
    <div className="stack">
      {stop.point ? (
        <div style={{ position: 'relative' }}>
          <MapView pins={pins} route={route?.points} routeDashed={route ? !route.routed : false} fitKey={j.id} style={{ height: 250 }} />
          {route ? (
            <div className="rider-map-eta">
              <strong>{fmtDuration(route.durationS)}</strong>
              <span>{fmtDistance(route.distanceM)}</span>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="notice small" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>
          This customer didn’t pin their address on the map. Navigate by the written address or call them.
        </div>
      )}

      {needsPickup ? (
        <ol className="trip">
          <li className="on">
            <span className="trip-dot store" />
            <span className="grow">
              <strong>Pick up at the pharmacy</strong>
              <small>{pickup?.address || 'Al-Barakah pharmacy counter'}</small>
            </span>
          </li>
          <li>
            <span className="trip-dot home" />
            <span className="grow">
              <strong>Deliver to {j.customer.name}</strong>
              <small>{a.line}</small>
            </span>
          </li>
        </ol>
      ) : null}

      <div className={`job-due ${due.late ? 'late' : ''}`}><Icon name="clock" size={16} /> {due.text}</div>

      <div className="group">
        <div>
          <span className="cell-icon"><Icon name="map" size={18} /></span>
          <span className="cell-main">
            <strong>{a.label ?? 'Address'}{a.zone ? ` · ${a.zone}` : ''}</strong>
            <span className="cell-sub">{a.line}</span>
            {a.notes ? <span className="cell-sub">“{a.notes}”</span> : null}
          </span>
        </div>
        {a.phone ? (
          <a href={telLink(a.phone)}>
            <span className="cell-icon"><Icon name="phone" size={18} /></span>
            <span className="cell-main">
              <strong>{j.customer.name}</strong>
              <span className="cell-sub">{a.phone} · tap to call</span>
            </span>
          </a>
        ) : null}
        <div>
          <span className="cell-icon"><Icon name="bag" size={18} /></span>
          <span className="cell-main">
            <strong>{j.items.reduce((n, i) => n + i.qty, 0)} items</strong>
            <span className="cell-sub">{j.items.map((i) => `${i.qty}× ${i.nameSnapshot}`).join(' · ')}</span>
          </span>
        </div>
        {j.notes ? (
          <div>
            <span className="cell-icon warn">“</span>
            <span className="cell-main"><span className="cell-sub">{j.notes}</span></span>
          </div>
        ) : null}
      </div>

      <div className="job-money">
        {cod ? (
          <span><span className="muted small">Collect cash</span><strong className="price" style={{ display: 'block' }}>{formatTk(j.totalPoisha)}</strong></span>
        ) : (
          <span><span className="muted small">Paid online</span><strong style={{ display: 'block' }}>Nothing to collect</strong></span>
        )}
        <span style={{ textAlign: 'right' }}><span className="muted small">You earn</span><strong style={{ display: 'block' }}>{formatTk(j.riderPayoutPoisha)}</strong></span>
      </div>

      <a className="btn block" href={navTo ? navLink(navTo, fix ?? undefined) : mapsLink(a.line)} target="_blank" rel="noreferrer">
        <Icon name="map" size={18} /> {needsPickup ? 'Navigate to pharmacy' : 'Navigate to customer'}
      </a>
      <div className="actions">
        {needsPickup ? (
          <button className="btn primary" onClick={() => void start(j)}>I’ve picked it up</button>
        ) : (
          <>
            <button className="btn danger" onClick={() => void fail(j)}>Failed</button>
            <button className="btn primary" onClick={() => handOver(j)}>Hand over</button>
          </>
        )}
      </div>
    </div>
  );
}

function Handover({ job, onSubmit }: { job: Job; onSubmit: (code: string) => Promise<boolean> }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const cod = job.paymentMethod === 'COD' && job.paymentStatus !== 'PAID';
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 4) return;
    setBusy(true);
    const ok = await onSubmit(code);
    setBusy(false);
    if (!ok) setCode('');
  }
  return (
    <form className="stack" onSubmit={(e) => void submit(e)}>
      {cod ? (
        <div className="notice ok" style={{ textAlign: 'center' }}>
          Collect <strong className="price">{formatTk(job.totalPoisha)}</strong> in cash first
        </div>
      ) : null}
      <p className="muted">Ask {job.customer.name} for the 4-digit code shown in their app or SMS.</p>
      <input
        className="input otp-input"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        maxLength={4}
        placeholder="••••"
        aria-label="Handover code"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
      />
      <button className="btn primary block" disabled={busy || code.length !== 4}>{busy ? 'Checking…' : 'Confirm delivery'}</button>
    </form>
  );
}
