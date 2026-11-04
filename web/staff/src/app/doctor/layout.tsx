'use client';

import { Portal, type Tab } from '@/components/Portal';
import { useApi, useGet } from '@/lib/api';
import type { DoctorSummary } from '@/lib/doctor';

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  const { user } = useApi();
  const { data: s } = useGet<DoctorSummary>(user?.role === 'DOCTOR' ? '/doctor/summary' : null, { pollMs: 120_000 });
  const tabs: Tab[] = [
    { href: '/doctor', label: 'Today', icon: 'home' },
    { href: '/doctor/bookings', label: 'Bookings', icon: 'calendar', badge: s?.today || undefined },
    { href: '/doctor/availability', label: 'Hours', icon: 'clock', badge: s && !s.hasAvailability ? 1 : undefined },
    { href: '/doctor/profile', label: 'Profile', icon: 'person' },
  ];
  return (
    <Portal role="DOCTOR" tabs={tabs}>
      {children}
    </Portal>
  );
}
