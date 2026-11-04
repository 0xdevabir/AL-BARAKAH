'use client';

import { distanceM, etaSeconds, fetchRoute, fmtDistance, fmtDuration, type LatLng, type MapPin, MapView, type Route } from '@albarakah/ui';
import { useEffect, useState } from 'react';
import { useGet } from '@/lib/api';

interface Track {
  status: string;
  promisedBy: string;
  pharmacy: LatLng;
  destination: LatLng | null;
  rider: (LatLng & { heading: number | null; speed: number | null; accuracy: number | null; at: string }) | null;
}

const LIVE = ['ASSIGNED', 'OUT_FOR_DELIVERY'];

/** Live map of the rider heading to the customer, refreshed every few seconds while on the way. */
export function LiveTrack({ orderId, status }: { orderId: string; status: string }) {
  const moving = status === 'OUT_FOR_DELIVERY';
  const { data: t } = useGet<Track>(LIVE.includes(status) ? `/orders/${orderId}/track` : null, { pollMs: moving ? 8_000 : 60_000 });
  const [route, setRoute] = useState<Route | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(i);
  }, []);

  const from: LatLng | null = t?.rider ?? t?.pharmacy ?? null;
  // Re-route roughly every 250 m of rider movement; the dot itself glides on every fix.
  const key = from && t?.destination ? `${Math.round(from.lat * 400)},${Math.round(from.lng * 400)}:${t.destination.lat},${t.destination.lng}` : '';
  useEffect(() => {
    if (!from || !t?.destination) return;
    const ac = new AbortController();
    void fetchRoute([from, t.destination], ac.signal).then((r) => !ac.signal.aborted && setRoute(r));
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!t?.destination) return null;

  const pins: MapPin[] = [
    { id: 'home', kind: 'home', point: t.destination, title: 'You' },
  ];
  if (!moving || !t.rider) pins.push({ id: 'store', kind: 'store', point: t.pharmacy, title: 'Pharmacy' });
  if (moving && t.rider) pins.push({ id: 'rider', kind: 'rider', point: t.rider, heading: t.rider.heading, title: 'Your rider' });

  // Remaining distance: along the route when we have it, else the straight line.
  const left = moving && t.rider ? (route?.routed ? route.distanceM : distanceM(t.rider, t.destination)) : null;
  const secs = left !== null ? (route?.routed ? route.durationS : etaSeconds(left)) : null;
  const stale = t.rider ? now - new Date(t.rider.at).getTime() > 90_000 : false;
  const near = left !== null && left < 150;

  return (
    <div className="livemap">
      <MapView
        pins={pins}
        route={moving && t.rider ? route?.points : null}
        routeDashed={route ? !route.routed : false}
        fitKey={`${status}:${t.rider ? 'r' : 'n'}`}
        style={{ height: moving ? 300 : 200 }}
        padTop={moving ? 60 : 24}
      />
      {moving ? (
        <div className="livemap-eta" aria-live="polite">
          {t.rider ? (
            near ? (
              <>
                <strong>Almost there</strong>
                <span>Your rider is outside</span>
              </>
            ) : (
              <>
                <strong>{secs !== null ? fmtDuration(secs) : '—'}</strong>
                <span>{left !== null ? `${fmtDistance(left)} away` : 'On the way'}</span>
              </>
            )
          ) : (
            <>
              <strong>On the way</strong>
              <span>Waiting for the rider’s location</span>
            </>
          )}
        </div>
      ) : (
        <div className="livemap-eta">
          <strong>Being picked up</strong>
          <span>The rider is collecting your order</span>
        </div>
      )}
      {stale ? <div className="livemap-stale">Last seen {Math.round((now - new Date(t.rider!.at).getTime()) / 60_000) || 1} min ago</div> : null}
    </div>
  );
}
