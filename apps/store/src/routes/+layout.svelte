<script lang="ts">
  import '@albarakah/ui/styles.css';
  import { onMount, type Snippet } from 'svelte';
  import { goto, onNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import { api, cart, MOBILE, tap } from '#lib/app.svelte.ts';
  import { m } from '#lib/paraglide/messages.js';
  import Intro from '#lib/Intro.svelte';
  import StoreHeader from '#lib/StoreHeader.svelte';
  import UpdatePrompt from '#lib/UpdatePrompt.svelte';

  let { children, data }: { children: Snippet; data: { categories: { id: string; name: string; slug: string; count: number }[] } } = $props();

  const ICONS = {
    home: 'M3 11 12 3l9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9Z',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4-4',
    doctors: 'M12 21s-8-5-8-11a4.500 4.500 0 0 1 8-2.800A4.500 4.500 0 0 1 20 10c0 6-8 11-8 11Z',
    orders: 'M4 7l8-4 8 4v10l-8 4-8-4V7Zm0 0 8 4 8-4m-8 4v10',
    account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0',
  };
  const tabs = $derived([
    { href: '/search', label: m.tab_search(), icon: ICONS.search },
    { href: '/doctors', label: m.tab_doctors(), icon: ICONS.doctors },
    { href: '/', label: m.tab_home(), icon: ICONS.home },
    { href: '/orders', label: m.tab_orders(), icon: ICONS.orders },
    { href: '/account', label: m.tab_account(), icon: ICONS.account },
  ]);
  const headerLinks = $derived(tabs.filter((t) => t.href !== '/' && t.href !== '/search'));
  const active = (href: string) => (href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href));
  const hideBar = $derived(page.url.pathname.startsWith('/checkout') || page.url.pathname.startsWith('/login'));
  const showCart = $derived(cart.count > 0 && !hideBar && !page.url.pathname.startsWith('/cart'));

  onMount(() => {
    if (MOBILE) document.documentElement.dataset.native = '1';
    // Never leave the shell frozen if the intro splash stalled.
    if (document.documentElement.dataset.intro === '1') {
      window.setTimeout(() => { document.documentElement.dataset.intro = '0'; }, 2200);
    }
    void api.restore();
    if (!MOBILE) return;
    // Returning from bKash, and the Android back button.
    void (async () => {
      const [{ App }, { Browser }] = await Promise.all([import('@capacitor/app'), import('@capacitor/browser')]);
      await App.addListener('appUrlOpen', ({ url }) => {
        const u = new URL(url);
        void Browser.close().catch(() => undefined);
        // barakabari://app has an empty path — send that to home, not a dead route.
        const path = u.pathname && u.pathname !== '/' ? u.pathname : '/';
        void goto(`${path}${u.search}`);
      });
      await App.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack) history.back();
        else void App.exitApp();
      });
    })();
  });

  // View transitions are desktop-only — on phones they intermittently freeze taps/navigation.
  onNavigate((nav) => {
    const phone = MOBILE || window.matchMedia('(max-width: 899px)').matches;
    if (phone || !document.startViewTransition || nav.from?.url.pathname === nav.to?.url.pathname) return;
    let settled = false;
    return new Promise((resolve) => {
      const release = () => { if (!settled) { settled = true; resolve(); } };
      document.startViewTransition(async () => {
        release();
        await nav.complete;
      });
      // If the transition never settles, don't hold the router forever.
      window.setTimeout(release, 600);
    });
  });
</script>

<Intro />
<UpdatePrompt />
<!--
  Phone chrome uses an app shell: .shell scrolls, .tabs stay in the flex footer.
  That keeps the tab bar pinned without position:fixed (which Android WebView
  demotes whenever any ancestor gets a transform/filter).
-->
<div class="frame" class:bare={hideBar} class:held={true}>
  {#if !hideBar}
    <StoreHeader links={headerLinks} categories={data.categories} />
  {/if}
  <div
    class="shell"
    onanimationend={(e) => {
      if (e.target === e.currentTarget) e.currentTarget.style.animation = 'none';
    }}
  >
    <main class="content">
      {@render children()}
    </main>
  </div>
  {#if showCart}
    <a class="cartbar" href="/cart" onpointerdown={() => tap()}>
      <span class="count mono">{cart.count}</span>
      <span class="grow">{m.view_cart()}</span>
    </a>
  {/if}
  {#if !hideBar}
    <nav class="tabs" aria-label="Main">
      {#each tabs as t (t.href)}
        <a href={t.href} class:on={active(t.href)} aria-current={active(t.href) ? 'page' : undefined} onpointerdown={() => tap()}>
          <span class="glyph">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={t.icon} /></svg>
          </span>
          <span class="label">{t.label}</span>
        </a>
      {/each}
    </nav>
  {/if}
</div>

<style>
  /* Phone: locked viewport shell — content scrolls, tabs never move. */
  .frame {
    position: relative; display: flex; flex-direction: column;
    height: 100dvh; max-height: 100dvh; overflow: hidden;
  }
  .shell {
    flex: 1; min-height: 0; overflow-x: hidden; overflow-y: auto;
    -webkit-overflow-scrolling: touch; overscroll-behavior-y: contain;
  }
  :global(html[data-intro='1']) .held { pointer-events: none; }
  :global(html[data-intro='1']) { overflow: hidden; }
  :global(html[data-intro='0']) .shell { animation: shell-in 0.45s var(--ease) both; }
  .content { padding-bottom: 28px; }
  .frame:has(.cartbar) .content { padding-bottom: calc(88px + env(safe-area-inset-bottom)); }
  .frame:has(:global(.dock)) .content { padding-bottom: calc(120px + env(safe-area-inset-bottom)); }
  .frame:has(.cartbar):has(:global(.dock)) .content { padding-bottom: calc(176px + env(safe-area-inset-bottom)); }
  .bare .content { padding-bottom: 0; }

  .tabs {
    flex: none; z-index: 40;
    display: flex; align-items: stretch; justify-content: space-around;
    gap: 2px; padding: 4px 6px 0;
    padding-bottom: max(6px, env(safe-area-inset-bottom));
    background: var(--raised);
    border-top: 1px solid var(--line);
    box-shadow: 0 -10px 28px rgb(40 36 24 / 0.06);
  }
  .tabs a {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 3px; min-width: 0; min-height: 52px; padding: 6px 2px 8px;
    color: var(--muted); font-size: 11px; font-weight: 600; letter-spacing: 0.01em; line-height: 1.1;
    text-align: center; touch-action: manipulation; transition: color 0.18s var(--ease);
  }
  .label { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .glyph {
    display: grid; place-items: center; width: 52px; height: 30px; border-radius: 15px;
    transition: background-color 0.18s var(--ease), transform 0.16s var(--ease);
  }
  .tabs a:active .glyph { transform: scale(0.9); }
  .tabs a.on { color: var(--accent-ink); }
  .tabs a.on .glyph { background: var(--sage-soft); }
  .tabs a.on svg { stroke-width: 2.25; }

  .cartbar {
    position: absolute; z-index: 39; left: 16px; right: 16px;
    bottom: calc(70px + env(safe-area-inset-bottom));
    display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 0 18px; border-radius: var(--r);
    background: var(--accent); color: var(--on-accent); font-weight: 600;
    box-shadow: var(--shadow), 0 10px 24px rgb(47 67 48 / 0.18);
    transition: transform 0.18s var(--ease), opacity 0.18s var(--ease);
    touch-action: manipulation;
  }
  .bare .cartbar { bottom: calc(16px + env(safe-area-inset-bottom)); }
  .cartbar:active { transform: scale(0.98); }
  .count { display: grid; place-items: center; min-width: 28px; height: 28px; padding: 0 7px; border-radius: 10px; background: rgb(255 255 255 / 0.22); font-size: 0.95rem; }

  /* Checkout/login: no tab bar — docks sit on the home indicator. */
  .bare :global(.dock) { bottom: calc(16px + env(safe-area-inset-bottom)); }

  @keyframes shell-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(html[data-intro='0']) .shell, .tabs a, .glyph, .cartbar { animation: none; transition: none; }
  }

  /* Bottom tabs already show where you are — hide duplicate page titles on phone. */
  @media (max-width: 899px) {
    :global(h1.tab-title) {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
  }

  @media (min-width: 900px) {
    /* Desktop: normal document scroll; top header owns navigation. */
    .frame { display: block; height: auto; max-height: none; overflow: visible; min-height: 100dvh; }
    .shell { overflow: visible; min-height: auto; }
    .content { padding-bottom: 48px; }
    .tabs, .cartbar { display: none; }
  }
</style>





