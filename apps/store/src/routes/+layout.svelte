<script lang="ts">
  import '@albarakah/ui/styles.css';
  import { onMount, type Snippet } from 'svelte';
  import { goto, onNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import { api, cart, MOBILE } from '#lib/app.svelte.ts';
  import { m } from '#lib/paraglide/messages.js';

  let { children }: { children: Snippet } = $props();

  const ICONS = {
    home: 'M3 11 12 3l9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9Z',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4-4',
    doctors: 'M12 21s-8-5-8-11a4.500 4.500 0 0 1 8-2.800A4.500 4.500 0 0 1 20 10c0 6-8 11-8 11Z',
    orders: 'M4 7l8-4 8 4v10l-8 4-8-4V7Zm0 0 8 4 8-4m-8 4v10',
    account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0',
  };
  const tabs = $derived([
    { href: '/', label: m.tab_home(), icon: ICONS.home },
    { href: '/search', label: m.tab_search(), icon: ICONS.search },
    { href: '/doctors', label: m.tab_doctors(), icon: ICONS.doctors },
    { href: '/orders', label: m.tab_orders(), icon: ICONS.orders },
    { href: '/account', label: m.tab_account(), icon: ICONS.account },
  ]);
  const active = (href: string) => (href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href));
  const hideBar = $derived(page.url.pathname.startsWith('/checkout') || page.url.pathname.startsWith('/login'));
  const showCart = $derived(cart.count > 0 && !hideBar && !page.url.pathname.startsWith('/cart'));

  onMount(() => {
    void api.restore();
    if (!MOBILE) return;
    // Returning from bKash, and the Android back button.
    void (async () => {
      const [{ App }, { Browser }] = await Promise.all([import('@capacitor/app'), import('@capacitor/browser')]);
      await App.addListener('appUrlOpen', ({ url }) => {
        const u = new URL(url);
        void Browser.close().catch(() => undefined);
        void goto(`${u.pathname}${u.search}`);
      });
      await App.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack) history.back();
        else void App.exitApp();
      });
    })();
  });

  onNavigate((nav) => {
    if (!document.startViewTransition || nav.from?.url.pathname === nav.to?.url.pathname) return;
    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await nav.complete;
      });
    });
  });
</script>

<div class="shell" class:bare={hideBar}>
  {#if !hideBar}
    <nav class="tabs" aria-label="Main">
      <span class="brand">AL-BARAKAH</span>
      {#each tabs as t (t.href)}
        <a href={t.href} class:on={active(t.href)} aria-current={active(t.href) ? 'page' : undefined}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={t.icon} /></svg>
          <span>{t.label}</span>
        </a>
      {/each}
    </nav>
  {/if}
  <main class="content">
    {@render children()}
    {#if showCart}
      <a class="cartbar" href="/cart">
        <span class="count mono">{cart.count}</span>
        <span class="grow">{m.view_cart()}</span>
      </a>
    {/if}
  </main>
</div>

<style>
  .shell { min-height: 100dvh; }
  .content { padding-bottom: calc(150px + env(safe-area-inset-bottom)); }
  .bare .content { padding-bottom: 0; }
  .tabs { position: fixed; z-index: 10; inset: auto 0 0; display: flex; padding: 6px 4px calc(6px + env(safe-area-inset-bottom)); border-top: 1px solid var(--line); background: color-mix(in srgb, var(--bg) 92%, transparent); }
  .brand { display: none; }
  .tabs a { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; min-height: 48px; justify-content: center; color: var(--muted); font-size: 0.68rem; font-weight: 500; transition: color 0.15s; }
  .tabs a.on { color: var(--accent-ink); }
  .cartbar { position: fixed; z-index: 9; inset: auto 12px calc(72px + env(safe-area-inset-bottom)); display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 0 16px; border-radius: var(--r); background: var(--accent); color: var(--on-accent); font-weight: 600; box-shadow: 0 6px 20px rgb(0 0 0 / 0.18); }
  .count { display: grid; place-items: center; min-width: 26px; height: 26px; padding: 0 6px; border-radius: 8px; background: rgb(255 255 255 / 0.22); font-size: 0.85rem; }

  @media (min-width: 900px) {
    .shell:not(.bare) { padding-left: 232px; }
    .content { padding-bottom: 96px; }
    .tabs { inset: 0 auto 0 0; flex-direction: column; gap: 4px; width: 232px; padding: 24px 12px; border-top: 0; border-right: 1px solid var(--line); }
    .brand { display: block; padding: 0 12px 20px; font-weight: 700; letter-spacing: 0.02em; color: var(--accent-ink); }
    .tabs a { flex: none; flex-direction: row; justify-content: flex-start; gap: 12px; padding: 0 12px; border-radius: 12px; font-size: 0.95rem; }
    .tabs a.on { background: var(--surface); }
    .cartbar { left: auto; right: 24px; bottom: 24px; width: 280px; }
  }
</style>
