'use client';

import { Portal } from '@/components/Portal';

const tabs = [
  { href: '/delivery', label: 'Jobs' },
  { href: '/delivery/earnings', label: 'Earnings' },
];

export default function DeliveryLayout({ children }: { children: React.ReactNode }) {
  return (
    <Portal role="RIDER" tabs={tabs}>
      {children}
    </Portal>
  );
}
