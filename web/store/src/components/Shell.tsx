'use client';

import { haptic, useScrollChrome } from '@albarakah/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BrandLockup } from '@/components/BrandLockup';
import { SearchBox } from '@/components/SearchBox';
import { useApi, useGet } from '@/lib/api';
import { telHref, usePublicSettings } from '@/lib/settings';
import { useCart } from '@/lib/useCart';

const tabs = [
  {
    href: '/prescription',
    label: 'Upload Rx',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
        <path d="M14 3v4h4M9 12h2.5a1.5 1.5 0 0 1 0 3H9v-3Zm0 3v3m2-3 3 3" />
      </svg>
    ),
  },
  {
    href: '/doctors',
    label: 'Doctors',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 21s-7-4.8-7-10a4.2 4.2 0 0 1 7-3 4.2 4.2 0 0 1 7 3c0 5.2-7 10-7 10Z" />
      </svg>
    ),
  },
  {
    href: '/',
    label: 'Home',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-8.5Z" />
      </svg>
    ),
  },
  {
    href: '/orders',
    label: 'Orders',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" />
        <path d="M4 7.5 12 12l8-4.5M12 12v9" />
      </svg>
    ),
  },
  {
    href: '/account',
    label: 'Account',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="9" r="3.5" />
        <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
      </svg>
    ),
  },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useApi();
  useScrollChrome();
  const { count } = useCart();
  const hotline = usePublicSettings()?.hotlines?.[0];
  const unread = useGet<{ unread: number }>(user ? '/notifications' : null, { staleMs: 30_000, pollMs: 60_000 }).data?.unread ?? 0;
  const [farDown, setFarDown] = useState(false);

  // The quick-scroll button appears once the customer is a couple of screens down a long list.
  useEffect(() => {
    const onScroll = () => setFarDown(window.scrollY > window.innerHeight * 1.5);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const hideBar = pathname.startsWith('/login') || pathname.startsWith('/checkout');
  const showCart = !hideBar && count > 0 && !pathname.startsWith('/cart');
  const activeIndex = tabs.findIndex((tab) => (tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href)));

  // Every new screen starts with the full tab bar showing.
  useEffect(() => {
    document.documentElement.dataset.compact = '0';
  }, [pathname]);

  return (
    <div className={`shell${hideBar ? ' bare' : ''}`}>
      <div className="statusbar" aria-hidden="true" />
      {!hideBar && (
        <header className="topbar">
          <div className="topbar-in">
            <Link href="/" className="topbar-brand" aria-label="BarakaBari home">
              <BrandLockup size={30} />
            </Link>
            <div className="topbar-search">{!pathname.startsWith('/search') && <SearchBox />}</div>
            <nav className="topbar-nav" aria-label="Main">
              {hotline ? (
                <a className="topbar-hotline" href={telHref(hotline)} aria-label={`Call hotline ${hotline}`}>
                  <PhoneIcon />
                  <span className="mono">{hotline}</span>
                </a>
              ) : null}
              {user ? (
                <Link href="/notifications" className="topbar-bell" aria-label={unread ? `${unread} unread notifications` : 'Notifications'} aria-current={pathname.startsWith('/notifications') ? 'page' : undefined}>
                  <BellIcon />
                  {unread ? <span className="bell-dot mono">{unread > 9 ? '9+' : unread}</span> : null}
                </Link>
              ) : null}
              {tabs
                .filter((tab) => tab.href !== '/')
                .map((tab) => (
                  <Link key={tab.href} href={tab.href} aria-current={pathname.startsWith(tab.href) ? 'page' : undefined}>
                    {tab.icon}
                    <span>{tab.label}</span>
                  </Link>
                ))}
              <Link href="/cart" className="topbar-cart" aria-current={pathname.startsWith('/cart') ? 'page' : undefined}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 8h14l-1.2 11.1a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9L5 8Z" />
                  <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
                </svg>
                <span>Cart</span>
                {count > 0 && (
                  <span className="topbar-count mono" key={count}>
                    {count}
                  </span>
                )}
              </Link>
            </nav>
          </div>
        </header>
      )}
      <main className="shell-main">
        <div className="screen" key={pathname}>
          {children}
        </div>
      </main>
      {!hideBar && (
        <div className="fabs">
          {farDown ? (
            <button type="button" className="fab glass" aria-label="Back to top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" /></svg>
            </button>
          ) : null}
          {user ? (
            <Link href="/notifications" className="fab glass fab-bell" aria-label={unread ? `${unread} unread notifications` : 'Notifications'}>
              <BellIcon />
              {unread ? <span className="bell-dot mono">{unread > 9 ? '9+' : unread}</span> : null}
            </Link>
          ) : null}
          {hotline ? (
            <a className="fab fab-call" href={telHref(hotline)} aria-label={`Call hotline ${hotline}`}>
              <PhoneIcon />
            </a>
          ) : null}
        </div>
      )}
      {!hideBar && (
        <div className="chrome">
          {showCart && (
            <Link className="cart-dock glass" href="/cart">
              <span className="cart-dock-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M5 8h14l-1.2 11.1a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9L5 8Z" />
                  <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
                </svg>
                <span className="cart-dock-count mono" key={count}>
                  {count}
                </span>
              </span>
              <span className="grow">
                <strong>Cart</strong>
                <span className="muted small">
                  {count} item{count === 1 ? '' : 's'}
                </span>
              </span>
              <span className="cart-dock-go">View</span>
            </Link>
          )}
          <nav
            className="tabbar glass"
            aria-label="Primary"
            style={{ '--n': tabs.length, '--i': Math.max(0, activeIndex) } as React.CSSProperties}
          >
            <span className="tab-lens" data-on={activeIndex >= 0} aria-hidden="true" />
            {tabs.map((tab, i) => {
              const active = i === activeIndex;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  data-active={active}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => {
                    if (active) window.scrollTo({ top: 0, behavior: 'smooth' });
                    else haptic('light');
                  }}
                >
                  {tab.icon}
                  <span className="tab-label">{tab.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 4h3.5l1.5 4-2 1.3a10.5 10.5 0 0 0 6.7 6.7L16 14l4 1.5V19a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </svg>
  );
}
