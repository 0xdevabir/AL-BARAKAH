'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Portal, type Tab } from '@/components/Portal';
import { useApi, useGet } from '@/lib/api';
import type { DoctorMe, DoctorSummary } from '@/lib/doctor';

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  const { user } = useApi();
  const router = useRouter();
  const isDoctor = user?.role === 'DOCTOR';
  const { data: s } = useGet<DoctorSummary>(isDoctor ? '/doctor/summary' : null, { pollMs: 120_000 });
  const { data: me } = useGet<DoctorMe>(isDoctor ? '/doctor/me' : null);
  // An invited doctor finishes setup before they see the working portal.
  useEffect(() => {
    if (me && !me.onboardedAt) router.replace('/onboarding');
  }, [me, router]);
  const tabs: Tab[] = [
    { href: '/doctor', label: 'Today', icon: 'home' },
    { href: '/doctor/bookings', label: 'Bookings', icon: 'calendar', badge: s?.today || undefined },
    { href: '/doctor/availability', label: 'Hours', icon: 'clock', badge: s && !s.hasAvailability ? 1 : undefined },
    { href: '/doctor/profile', label: 'Profile', icon: 'person' },
  ];
  return (
    <Portal role="DOCTOR" tabs={tabs}>
      {me && !me.onboardedAt ? null : children}
    </Portal>
  );
}
