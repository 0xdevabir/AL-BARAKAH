<script lang="ts">
  import { browser } from '$app/env';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { api, type Medicine } from '#lib/app.svelte.ts';
  import MedicineRow from '#lib/MedicineRow.svelte';
  import { m } from '#lib/paraglide/messages.js';

  let q = $state(page.url.searchParams.get('q') ?? '');
  const category = $derived(page.url.searchParams.get('category') ?? '');
  let items = $state<Medicine[]>([]);
  let hasMore = $state(false);
  let pageNo = 1;
  let loaded = $state(false);
  let error = $state('');
  let latest = 0;
  let loading = $state(false);
  let categories = $state<{ id: string; name: string; slug: string; count: number }[]>([]);
  const chipHref = (slug: string) => {
    const params = new URLSearchParams({ ...(q.trim() ? { q: q.trim() } : {}), ...(slug ? { category: slug } : {}) });
    return `/search${params.size ? `?${params}` : ''}`;
  };

  $effect(() => {
    void api.get<typeof categories>('/categories').then((all) => (categories = all.filter((c) => c.count > 0))).catch(() => undefined);
  });

  /** Loads the next page as the end of the list scrolls into view. */
  function autoMore(node: HTMLElement) {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loading) void run(true);
    }, { rootMargin: '400px' });
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }

  async function run(more = false) {
    const ticket = ++latest; // A slow older response must not overwrite newer results.
    pageNo = more ? pageNo + 1 : 1;
    error = '';
    loading = true;
    try {
      const params = new URLSearchParams({ page: String(pageNo), ...(q ? { q } : {}), ...(category ? { category } : {}) });
      const r = await api.get<{ items: Medicine[]; hasMore: boolean }>(`/medicines?${params}`);
      if (ticket !== latest) return;
      items = more ? [...items, ...r.items] : r.items;
      hasMore = r.hasMore;
      loaded = true;
    } catch (err) {
      if (ticket === latest) error = (err as Error).message;
    } finally {
      if (ticket === latest) loading = false;
    }
  }

  $effect(() => {
    void q; void category;
    if (!browser) return;
    const t = setTimeout(() => {
      void run();
      // Keeps the search shareable and restores it on Back, without adding a history entry per keystroke.
      const target = chipHref(category);
      if (target !== `${page.url.pathname}${page.url.search}`) void goto(target, { replaceState: true, keepFocus: true, noScroll: true });
    }, q ? 150 : 0);
    return () => clearTimeout(t);
  });
</script>

<svelte:head>
  <title>{m.tab_search()} · AL-BARAKAH</title>
  <meta name="description" content="Search medicines by brand or generic name and order for delivery in Bangladesh." />
</svelte:head>

<div class="page">
  <h1 class="title">{m.tab_search()}</h1>
  <input class="input" type="search" bind:value={q} placeholder={m.search_placeholder()} aria-label={m.tab_search()} autocomplete="off" enterkeyhint="search" />
  {#if categories.length}
    <div class="chips">
      <a class="btn small" class:primary={!category} href={chipHref('')} data-sveltekit-replacestate data-sveltekit-noscroll>{m.all_categories()}</a>
      {#each categories as c (c.id)}
        <a class="btn small" class:primary={category === c.slug} href={chipHref(c.slug)} data-sveltekit-replacestate data-sveltekit-noscroll>{c.name}</a>
      {/each}
    </div>
  {/if}
  <div class="results" aria-busy={loading}>
    {#if error}
      <div class="empty stack"><p>{error}</p><button class="btn" onclick={() => run()}>{m.retry()}</button></div>
    {:else if !loaded}
      <div class="group" aria-hidden="true">{#each [1, 2, 3, 4, 5, 6] as n (n)}<div class="ghost"></div>{/each}</div>
    {:else if items.length === 0}
      <p class="empty">{m.no_results()}</p>
    {:else if items.length}
      <div class="group">{#each items as med (med.id)}<MedicineRow medicine={med} />{/each}</div>
      {#if hasMore}<button class="btn block more" use:autoMore disabled={loading} onclick={() => run(true)}>{m.load_more()}</button>{/if}
    {/if}
  </div>
</div>

<style>
  .results { margin-top: 16px; }
  .more { margin-top: 12px; }
  .chips { display: flex; gap: 8px; margin: 12px -16px 0; padding: 0 16px; overflow-x: auto; scrollbar-width: none; }
  .chips a { flex: none; }
  .chips a:not(.primary) { background: var(--raised); }
  .ghost { height: 64px; border-radius: 12px; background: var(--raised); animation: pulse 1.2s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: 0.5; } }
  @media (prefers-reduced-motion: reduce) { .ghost { animation: none; } }
</style>
