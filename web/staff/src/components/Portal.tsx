'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useApi } from '@/lib/api';
import { homeFor } from '@/lib/app';

export function Portal({
  role,
  tabs,
  children,
}: {
  role: 'ADMIN' | 'RIDER' | 'DOCTOR';
  tabs: { href: string; label: string }[];
  children: React.ReactNode;
}) {
  const { user, ready } = useApi();
  const router = useRouter();
  const pathname = usePathname();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const ok = user?.role === role && (role !== 'ADMIN' || !!user.mfa);
    setAllowed(ok);
    if (!ok) {
      router.replace(user && !(user.role === 'ADMIN' && !user.mfa) ? homeFor(user.role) : '/login');
    }
  }, [ready, role, router, user]);

  if (!ready || !allowed) return <div className="page muted">Checking access…</div>;

  return (
    <div className="stack">
      <div className="portal-tabs">
        {tabs.map((t) => {
          const on = tabs[0]?.href === t.href ? pathname === t.href : pathname.startsWith(t.href);
          return (
            <Link key={t.href} href={t.href} className={`btn small${on ? ' primary' : ''}`} aria-current={on ? 'page' : undefined}>
              {t.label}
            </Link>
          );
        })}
      </div>
      {children}
    </div>
  );
}
