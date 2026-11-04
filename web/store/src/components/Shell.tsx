'use client';

import { haptic, useScrollChrome } from '@albarakah/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useApi } from '@/lib/api';
import { useCart } from '@/lib/useCart';

const tabs = [
  {
    href: '/search',
    label: 'Search',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16.5 16.5 21 21" />
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
  useApi();
  useScrollChrome();
  const { count } = useCart();
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
      <main className="shell-main">
        <div className="screen" key={pathname}>
          {children}
        </div>
      </main>
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


