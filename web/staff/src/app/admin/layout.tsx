'use client';

import { useUnread } from '@/components/Inbox';
import { Portal, type Tab } from '@/components/Portal';
import { useApi, useGet } from '@/lib/api';
import type { Counts } from '@/lib/types';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = useApi();
  const isAdmin = user?.role === 'ADMIN' && !!user.mfa;
  const { data: counts } = useGet<Counts>(isAdmin ? '/admin/orders/counts' : null, { pollMs: 30_000 });
  const unread = useUnread(isAdmin);

  const tabs: Tab[] = [
    { href: '/admin', label: 'Dashboard', icon: 'chart' },
    { href: '/admin/orders', label: 'Orders', icon: 'bag', badge: counts?.counts.PLACED },
    { href: '/admin/deliveries', label: 'Live deliveries', icon: 'bike' },
    { href: '/admin/medicines', label: 'Catalog', icon: 'pill' },
    { href: '/admin/inbox', label: 'Inbox', icon: 'list', badge: unread },
    { href: '/admin/people', label: 'Team', icon: 'users' },
    { href: '/admin/customers', label: 'Customers', icon: 'person' },
    { href: '/admin/consultations', label: 'Consultations', icon: 'stetho' },
    { href: '/admin/prescriptions', label: 'Prescriptions', icon: 'doc' },
    { href: '/admin/finance', label: 'Finance', icon: 'wallet' },
    { href: '/admin/zones', label: 'Zones', icon: 'map2' },
    { href: '/admin/settings', label: 'Settings', icon: 'gear' },
    { href: '/admin/audit', label: 'Audit log', icon: 'shield' },
  ];

  return (
    <Portal role="ADMIN" tabs={tabs}>
      {children}
    </Portal>
  );
}
