'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApi } from '@/lib/api';

const links = [
  { href: '/', label: 'Home' },
  { href: '/admin', label: 'Admin' },
  { href: '/delivery', label: 'Delivery' },
  { href: '/doctor', label: 'Doctor' },
  { href: '/login', label: 'Sign in' },
];

export function StaffShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useApi();

  return (
    <div className="staff-shell">
      <header className="staff-top">
        <Link href="/" className="staff-brand">
          <span className="mark" aria-hidden="true">
            +
          </span>
          BarakaBari Staff
        </Link>
        <nav aria-label="Staff">
          {links.map((link) => {
            const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
            return (
              <Link key={link.href} href={link.href} data-active={active} aria-current={active ? 'page' : undefined}>
                {link.label}
              </Link>
            );
          })}
        </nav>
        {user ? <span className="muted small">{user.name}</span> : null}
      </header>
      <main className="staff-main">{children}</main>
    </div>
  );
}
