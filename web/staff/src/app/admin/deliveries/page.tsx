'use client';

import { EmptyState, fmtRelative, fmtTime, LargeTitle, type LatLng, type MapPin, MapView, SkeletonList, StatTile, statusLabel, statusTone } from '@albarakah/ui';
import Link from 'next/link';
import { useState } from 'react';
import { useGet } from '@/lib/api';
import { telLink } from '@/lib/app';

interface Fix { lat: number; lng: number; heading: number | null; speed: number | null; accuracy: number | null; at: string }
interface LiveOrder {
  id: string;
  code: string;
  status: string;
  type: string;
  promisedBy: string | null;
  late: boolean;
  riderAccepted: boolean;
  rider: { id: string; name: string; phone: string } | null;
  destination: LatLng | null;
  area: string;
  line: string;
  location: Fix | null;
}
interface Live { pharmacy: LatLng | null; orders: LiveOrder[] }

/** A fix older than this is shown greyed out: the rider's phone has probably stopped sharing. */
const STALE_MS = 3 * 60_000;

/** Every open delivery on one map, with each rider's last GPS fix. Refreshes every 15 seconds. */
export default function LiveDeliveries() {
  const { data, error, pending } = useGet<Live>('/admin/deliveries/live', { pollMs: 15_000 });
  const [sel, setSel] = useState<string | null>(null);

  if (error && !data) return <p className="error">{error.message}</p>;
  if (pending || !data) return <SkeletonList rows={5} />;

  const now = Date.now();
  const orders = data.orders;
  const onRoad = orders.filter((o) => o.location);
  const pins: MapPin[] = [];
  if (data.pharmacy) pins.push({ id: 'store', point: data.pharmacy, kind: 'store', title: 'Pharmacy' });
  const riderSeen = new Set<string>();
  for (const o of orders) {
    if (o.destination) pins.push({ id: `d-${o.id}`, point: o.destination, kind: 'home', label: o.code.slice(-4), active: sel === o.id, muted: !!sel && sel !== o.id, title: `${o.code} · ${o.area}`, onClick: () => setSel(o.id) });
    if (o.rider && o.location && !riderSeen.has(o.rider.id)) {
      riderSeen.add(o.rider.id);
      pins.push({
        id: `r-${o.rider.id}`,
        point: { lat: o.location.lat, lng: o.location.lng },
        kind: 'rider',
        heading: o.location.heading,
        label: o.rider.name.split(' ')[0],
        muted: now - new Date(o.location.at).getTime() > STALE_MS,
        active: sel === o.id,
        title: `${o.rider.name} · seen ${fmtRelative(o.location.at, now)}`,
        onClick: () => setSel(o.id),
      });
    }
  }
  const focusOrder = orders.find((o) => o.id === sel);
  const focus = focusOrder ? [`d-${focusOrder.id}`, ...(focusOrder.rider ? [`r-${focusOrder.rider.id}`] : [])] : undefined;

  return (
    <>
      <LargeTitle sub="Open deliveries and where each rider is now">Live deliveries</LargeTitle>
      <div className="stats">
        <StatTile label="Open deliveries" value={orders.length} />
        <StatTile label="Riders sharing GPS" value={riderSeen.size} />
        <StatTile label="Waiting for a rider" value={orders.filter((o) => !o.rider).length} tone={orders.some((o) => !o.rider) ? 'warn' : undefined} />
        <StatTile label="Late" value={orders.filter((o) => o.late).length} tone={orders.some((o) => o.late) ? 'bad' : undefined} />
      </div>

      {orders.length ? (
        <>
          <div className="live-map">
            <MapView pins={pins} fitKey={sel ?? `all-${orders.length}`} focus={focus} style={{ height: 'min(56vh, 460px)' }} />
          </div>
          <div className="group cv" style={{ marginTop: 14 }}>
            {orders.map((o) => {
              const stale = o.location ? now - new Date(o.location.at).getTime() > STALE_MS : false;
              return (
                <div key={o.id} className={`cell live-row${sel === o.id ? ' on' : ''}`} onClick={() => setSel(sel === o.id ? null : o.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSel(o.id)}>
                  <span className="cell-main">
                    <strong>
                      {o.code} <span className="muted small">{o.area}</span>
                    </strong>
                    <span className="cell-sub">
                      {o.rider ? (
                        <>
                          {o.rider.name} · <a href={telLink(o.rider.phone)} onClick={(e) => e.stopPropagation()}>{o.rider.phone}</a>
                          {o.rider && !o.riderAccepted ? ' · not accepted yet' : ''}
                          {o.location ? ` · GPS ${fmtRelative(o.location.at, now)}${stale ? ' (stale)' : ''}` : ' · no GPS'}
                        </>
                      ) : 'No rider assigned'}
                    </span>
                    {o.promisedBy ? <span className={`cell-sub${o.late ? ' bad' : ''}`}>{o.late ? 'Late — promised ' : 'Promised by '}{fmtTime(o.promisedBy)}{o.type === 'EMERGENCY' ? ' · urgent' : ''}</span> : null}
                  </span>
                  <span className="row" style={{ gap: 6 }}>
                    <span className={`chip ${statusTone(o.status)}`}>{statusLabel(o.status)}</span>
                    <Link className="btn small" href={`/admin/orders?open=${o.id}`} onClick={(e) => e.stopPropagation()}>Open</Link>
                  </span>
                </div>
              );
            })}
          </div>
          {!onRoad.length ? <p className="muted small" style={{ marginTop: 8 }}>No rider is sharing a location right now. Riders share GPS from the rider app once they accept a job.</p> : null}
        </>
      ) : (
        <EmptyState icon="🛵" title="No deliveries on the road">Orders appear here once they are assigned to a rider.</EmptyState>
      )}
    </>
  );
}
