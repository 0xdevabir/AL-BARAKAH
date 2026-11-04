'use client';

import { Portal } from '@/components/Portal';

const tabs = [
  { href: '/admin', label: 'Orders' },
  { href: '/admin/medicines', label: 'Medicines' },
  { href: '/admin/people', label: 'People' },
  { href: '/admin/consultations', label: 'Consultations' },
  { href: '/admin/settings', label: 'Settings' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Portal role="ADMIN" tabs={tabs}>
      {children}
    </Portal>
  );
}
