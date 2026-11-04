'use client';

import { distanceM, type LatLng } from '@albarakah/ui';
import { useEffect, useSyncExternalStore } from 'react';
import { api } from './api';

export interface Fix extends LatLng {
  heading: number | null;
  speed: number | null;
  accuracy: number;
  at: number;
}
export type TrackStatus = 'off' | 'locating' | 'live' | 'denied' | 'error';

/** Send at most this often, or sooner once the rider has moved this far. */
const SEND_MS = 15_000;
const SEND_MIN_MS = 5_000;
const SEND_MOVE_M = 40;

let state: { fix: Fix | null; status: TrackStatus; sentAt: number | null } = { fix: null, status: 'off', sentAt: null };
const listeners = new Set<() => void>();
const set = (next: Partial<typeof state>) => {
  state = { ...state, ...next };
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => state;
const serverSnapshot = () => state;

/** The rider's latest GPS fix and whether it is being shared. */
export function useRiderFix() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

/**
 * While on shift, watch GPS and share it so customers see the rider move. Each send also
 * keeps the shift alive on the server.
 */
export function useRiderTracking(onShift: boolean) {
  useEffect(() => {
    if (!onShift) {
      set({ status: 'off' });
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      set({ status: 'error' });
      return;
    }
    let last: { at: number; p: LatLng } | null = null;
    let inFlight = false;
    let pending: Fix | null = null;

    const send = async (f: Fix, force = false) => {
      const now = Date.now();
      if (inFlight) {
        pending = f;
        return;
      }
      if (!force && last) {
        const age = now - last.at;
        if (age < SEND_MIN_MS) return;
        if (age < SEND_MS && distanceM(last.p, f) < SEND_MOVE_M) return;
      }
      inFlight = true;
      try {
        await api.put('/delivery/location', {
          lat: +f.lat.toFixed(6),
          lng: +f.lng.toFixed(6),
          heading: f.heading !== null && Number.isFinite(f.heading) ? Math.round(f.heading) % 360 : null,
          speed: f.speed !== null && Number.isFinite(f.speed) ? Math.min(100, Math.max(0, f.speed)) : null,
          accuracy: Math.min(10_000, Math.round(f.accuracy)),
        });
        last = { at: Date.now(), p: f };
        set({ sentAt: last.at });
      } catch {
        /* offline — the next fix retries */
      } finally {
        inFlight = false;
        const p = pending;
        pending = null;
        if (p) void send(p);
      }
    };

    set({ status: state.fix ? 'live' : 'locating' });
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const c = pos.coords;
        const fix: Fix = { lat: c.latitude, lng: c.longitude, heading: c.heading ?? null, speed: c.speed ?? null, accuracy: c.accuracy, at: pos.timestamp };
        set({ fix, status: 'live' });
        void send(fix);
      },
      (e) => set({ status: e.code === 1 ? 'denied' : 'error' }),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
    );
    // A parked rider produces no new fixes; resend the last one so the shift and dot stay alive.
    const keepAlive = setInterval(() => {
      if (state.fix && document.visibilityState === 'visible') void send(state.fix, true);
    }, 60_000);
    return () => {
      navigator.geolocation.clearWatch(id);
      clearInterval(keepAlive);
      set({ status: 'off' });
    };
  }, [onShift]);
}
