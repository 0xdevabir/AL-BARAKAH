<script lang="ts">
  import { afterNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import { cart } from '#lib/app.svelte.ts';
  import { m } from '#lib/paraglide/messages.js';
  import CategoryIcon from './CategoryIcon.svelte';
  import SearchBox from './SearchBox.svelte';

  type Link = { href: string; label: string; icon: string };
  let { links, categories }: { links: Link[]; categories: { id: string; name: string; slug: string; count: number }[] } = $props();

  let menuOpen = $state(false);
  let menu = $state<HTMLElement>();
  const currentCategory = $derived(page.url.pathname === '/search' ? page.url.searchParams.get('category') : null);

  afterNavigate(() => (menuOpen = false));
</script>

<svelte:window
  onclick={(e) => { if (menuOpen && !menu?.contains(e.target as Node)) menuOpen = false; }}
  onkeydown={(e) => { if (e.key === 'Escape') menuOpen = false; }}
/>

<header class="bar">
  <div class="inner">
    <a class="brand" href="/">AL-BARAKAH</a>
    {#if page.url.pathname !== '/search'}<div class="search"><SearchBox /></div>{/if}
    <nav class="links" aria-label="Main">
      {#each links as l (l.href)}
        <a href={l.href} class:on={page.url.pathname.startsWith(l.href)} aria-current={page.url.pathname.startsWith(l.href) ? 'page' : undefined}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={l.icon} /></svg>
          {l.label}
        </a>
      {/each}
      <a class="cart" href="/cart" aria-current={page.url.pathname === '/cart' ? 'page' : undefined}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h2l2.500 12h11l2-9H6.500M9 20.500h.01M17 20.500h.01" /></svg>
        {m.cart()}
        {#if cart.count > 0}<span class="count mono">{cart.count}</span>{/if}
      </a>
    </nav>
  </div>
</header>

<div class="cats" bind:this={menu}>
  <div class="inner">
    <button class="all" aria-expanded={menuOpen} aria-controls="all-categories" onclick={() => (menuOpen = !menuOpen)}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
      {m.all_categories_menu()}
    </button>
    <nav class="quick" aria-label={m.categories()}>
      {#each categories as c (c.id)}
        <a href="/search?category={c.slug}" class:on={currentCategory === c.slug}>{c.name}</a>
      {/each}
    </nav>
  </div>
  {#if menuOpen}
    <div class="mega" id="all-categories">
      {#each categories as c (c.id)}
        <a href="/search?category={c.slug}">
          <span class="icon"><CategoryIcon slug={c.slug} /></span>
          <span class="grow">{c.name}</span>
          <span class="muted small mono">{c.count.toLocaleString()}</span>
        </a>
      {/each}
    </div>
  {/if}
</div>

<style>
  .bar, .cats { display: none; }
  .inner { display: flex; align-items: center; max-width: 1320px; margin: 0 auto; padding: 0 24px; }

  @media (min-width: 900px) {
    .bar { display: block; position: sticky; top: 0; z-index: 30; border-bottom: 1px solid var(--line); background: var(--raised); }
    .bar .inner { gap: 24px; min-height: 72px; }
    .brand { flex: none; font-size: 1.2rem; font-weight: 700; letter-spacing: -0.01em; color: var(--accent-ink); }
    .search { flex: 1; min-width: 0; max-width: 620px; }
    .links { display: flex; gap: 2px; margin-left: auto; }
    .links a { display: flex; align-items: center; gap: 7px; min-height: 44px; padding: 0 12px; border-radius: var(--r-sm); font-size: 0.925rem; font-weight: 500; white-space: nowrap; transition: background 0.15s; }
    .links a:hover { background: var(--surface); }
    .links a.on { color: var(--accent-ink); background: var(--sage-soft); }
    .cart { margin-left: 6px; background: var(--sage-soft); color: var(--accent-ink); font-weight: 600; }
    .count { display: grid; place-items: center; min-width: 22px; height: 22px; padding: 0 5px; border-radius: 999px; background: var(--accent); color: var(--on-accent); font-size: 0.78rem; }

    .cats { display: block; position: relative; z-index: 25; border-bottom: 1px solid var(--line); background: var(--raised); }
    .cats .inner { gap: 8px; min-height: 46px; }
    .all { flex: none; display: flex; align-items: center; gap: 8px; min-height: 36px; padding: 0 12px 0 10px; border: 0; border-radius: 10px; background: var(--accent); color: var(--on-accent); font: inherit; font-size: 0.9rem; font-weight: 600; cursor: pointer; }
    .quick { display: flex; flex: 1; min-width: 0; overflow-x: auto; scrollbar-width: none; }
    .quick a { flex: none; display: flex; align-items: center; min-height: 36px; padding: 0 10px; border-radius: 10px; font-size: 0.9rem; white-space: nowrap; }
    .quick a:hover { background: var(--surface); }
    .quick a.on { color: var(--accent-ink); font-weight: 600; background: var(--sage-soft); }

    .mega { position: absolute; top: 100%; left: 50%; display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; width: min(1272px, calc(100vw - 48px)); max-height: calc(100dvh - 140px); padding: 12px; overflow-y: auto; transform: translateX(-50%); border: 1px solid var(--line); border-top: 0; border-radius: 0 0 var(--r) var(--r); background: var(--raised); box-shadow: 0 18px 36px rgb(0 0 0 / 0.14); }
    .mega a { display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 6px 10px; border-radius: var(--r-sm); font-size: 0.95rem; }
    .mega a:hover { background: var(--bg); }
    .icon { display: grid; place-items: center; flex: none; width: 38px; height: 38px; border-radius: 11px; background: var(--sage-soft); color: var(--accent-ink); }
  }
</style>
