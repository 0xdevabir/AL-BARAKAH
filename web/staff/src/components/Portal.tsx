'use client';

import { chooseAction, clearQueries, confirmAction, initials } from '@albarakah/ui';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useApi } from '@/lib/api';
import { homeFor } from '@/lib/app';
import { Icon } from './Icon';

export interface Tab {
  href: string;
  label: string;
  icon: string;
  badge?: number;
}

const ROLE_NAME = { ADMIN: 'Admin', RIDER: 'Rider', DOCTOR: 'Doctor' } as const;
const MOBILE_TABS = 4;

/**
 * The staff chrome: a translucent sidebar on wide screens, an iOS tab bar on phones.
 * It also guards the role, so a rider can never land on an admin screen.
 */
export function Portal({ role, tabs, children }: { role: keyof typeof ROLE_NAME; tabs: Tab[]; children: React.ReactNode }) {
  const { api, user, ready } = useApi();
  const router = useRouter();
  const pathname = usePathname();
  const allowed = !!user && user.role === role && (role !== 'ADMIN' || !!user.mfa);

  useEffect(() => {
    if (!ready || allowed) return;
    router.replace(user && !(user.role === 'ADMIN' && !user.mfa) ? homeFor(user.role) : '/login');
  }, [ready, allowed, router, user]);

  // Warm the next screens so tab switches feel instant.
  useEffect(() => {
    if (allowed) tabs.forEach((t) => router.prefetch(t.href));
  }, [allowed, router, tabs]);

  if (!ready || !allowed) {
    return (
      <div className="boot" aria-busy="true">
        <span className="boot-mark">+</span>
      </div>
    );
  }

  const isOn = (href: string) => (href === tabs[0]!.href ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
  const primary = tabs.length > MOBILE_TABS + 1 ? tabs.slice(0, MOBILE_TABS) : tabs;
  const overflow = tabs.length > MOBILE_TABS + 1 ? tabs.slice(MOBILE_TABS) : [];
  const overflowOn = overflow.some((t) => isOn(t.href));

  async function signOut() {
    if (!(await confirmAction({ title: 'Sign out?', message: 'You will need your phone to sign in again.', confirm: 'Sign out', destructive: true }))) return;
    await api.logout();
    clearQueries();
    router.replace('/login');
  }

  async function more() {
    const href = await chooseAction('More', [
      ...overflow.map((t) => ({ label: t.badge ? `${t.label} (${t.badge})` : t.label, value: t.href })),
      { label: 'Sign out', value: '__out', destructive: true },
    ]);
    if (href === '__out') void signOut();
    else if (href) router.push(href);
  }

  return (
    <div className="portal">
      <aside className="side" aria-label={`${ROLE_NAME[role]} navigation`}>
        <Link href={tabs[0]!.href} className="side-brand">
          <span className="mark" aria-hidden="true">+</span>
          <span>
            BarakaBari
            <small>{ROLE_NAME[role]}</small>
          </span>
        </Link>
        <nav>
          {tabs.map((t) => (
            <Link key={t.href} href={t.href} className="side-link" aria-current={isOn(t.href) ? 'page' : undefined}>
              <Icon name={t.icon} size={20} />
              <span className="grow">{t.label}</span>
              {t.badge ? <span className="badge">{t.badge > 99 ? '99+' : t.badge}</span> : null}
            </Link>
          ))}
        </nav>
        <button type="button" className="side-user" onClick={() => void signOut()}>
          <span className="avatar">{initials(user.name)}</span>
          <span className="grow">
            <strong>{user.name}</strong>
            <span className="muted small">Sign out</span>
          </span>
          <Icon name="logout" size={18} />
        </button>
      </aside>

      <main className="portal-main">
        <div className="screen" key={pathname}>
          {children}
        </div>
      </main>

      <nav className="tabbar" aria-label={`${ROLE_NAME[role]} tabs`}>
        {primary.map((t) => (
          <Link key={t.href} href={t.href} className="tab" aria-current={isOn(t.href) ? 'page' : undefined}>
            <span className="tab-icon">
              <Icon name={t.icon} />
              {t.badge ? <span className="badge">{t.badge > 99 ? '99+' : t.badge}</span> : null}
            </span>
            {t.label}
          </Link>
        ))}
        {overflow.length ? (
          <button type="button" className="tab" aria-current={overflowOn ? 'page' : undefined} onClick={() => void more()}>
            <span className="tab-icon">
              <Icon name="list" />
              {overflow.some((t) => t.badge) ? <span className="badge dot" /> : null}
            </span>
            More
          </button>
        ) : null}
      </nav>
    </div>
  );
}
