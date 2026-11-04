'use client';

import { Portal } from '@/components/Portal';

const tabs = [
  { href: '/doctor', label: 'Bookings' },
  { href: '/doctor/availability', label: 'Availability' },
];

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  return (
    <Portal role="DOCTOR" tabs={tabs}>
      {children}
    </Portal>
  );
}
