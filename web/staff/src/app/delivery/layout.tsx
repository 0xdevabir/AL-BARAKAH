'use client';

import { useEffect } from 'react';
import { Portal, type Tab } from '@/components/Portal';
import { api, useApi, useGet } from '@/lib/api';

const HEARTBEAT_MS = 5 * 60_000;

export default function DeliveryLayout({ children }: { children: React.ReactNode }) {
  const { user } = useApi();
  const isRider = user?.role === 'RIDER';
  const { data: jobs } = useGet<{ id: string }[]>(isRider ? '/delivery/jobs' : null);
  const { data: summary } = useGet<{ online: boolean }>(isRider ? '/delivery/summary' : null);

  // The server forgets a rider after 15 minutes of silence, so keep the shift alive while the app is open.
  useEffect(() => {
    if (!summary?.online) return;
    const beat = () => document.visibilityState === 'visible' && void api.put('/delivery/online', { online: true }).catch(() => undefined);
    const t = setInterval(beat, HEARTBEAT_MS);
    document.addEventListener('visibilitychange', beat);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', beat);
    };
  }, [summary?.online]);

  const tabs: Tab[] = [
    { href: '/delivery', label: 'Today', icon: 'bike', badge: jobs?.length },
    { href: '/delivery/history', label: 'History', icon: 'clock' },
    { href: '/delivery/earnings', label: 'Earnings', icon: 'wallet' },
  ];
  return (
    <Portal role="RIDER" tabs={tabs}>
      {children}
    </Portal>
  );
}
