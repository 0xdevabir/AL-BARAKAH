'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  const { count } = useCart();
  const hideBar = pathname.startsWith('/login') || pathname.startsWith('/checkout');
  const showCart = !hideBar && count > 0 && !pathname.startsWith('/cart');

  return (
    <div className="shell">
      <main className="shell-main">{children}</main>
      {showCart && (
        <Link className="dock cart-dock" href="/cart">
          <span className="grow">
            <span className="muted small">Cart</span>
            <strong>
              {count} item{count === 1 ? '' : 's'}
            </strong>
          </span>
          <span className="btn primary small">View</span>
        </Link>
      )}
      {!hideBar && (
        <nav className="tabbar" aria-label="Primary">
          {tabs.map((tab) => {
            const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
            return (
              <Link key={tab.href} href={tab.href} data-active={active} aria-current={active ? 'page' : undefined}>
                {tab.icon}
                {tab.label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}


