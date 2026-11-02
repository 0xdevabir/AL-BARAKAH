<script lang="ts" module>
  import type { Medicine } from '#lib/app.svelte.ts';

  interface Loaded { items: Medicine[]; hasMore: boolean; pageNo: number }
  // Lets Back return to the same spot in a long list instead of the first page.
  const visited = new Map<string, Loaded>();
</script>

<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { browser } from '$app/env';
  import { navigating } from '$app/state';
  import { api } from '#lib/app.svelte.ts';
  import { m } from '#lib/paraglide/messages.js';
  import ProductCard from './ProductCard.svelte';

  // Loads by itself for this many pages, then waits for a tap so the page end stays reachable.
  const AUTO_PAGES = 5;

  let { q = '', category = '', initial, total }: { q?: string; category?: string; initial?: { items: Medicine[]; hasMore: boolean }; total?: number } = $props();

  const key = $derived(`${q}|${category}`);
  const start = untrack(() => (browser && navigating.type === 'popstate' ? visited.get(key) : undefined) ?? (initial && { ...initial, pageNo: 1 }));

  let items = $state.raw<Medicine[]>(start?.items ?? []);
  let hasMore = $state(start?.hasMore ?? false);
  let pageNo = $state(start?.pageNo ?? 1);
  let loaded = $state(!!start);
  let loading = $state(false);
  let error = $state('');
  let shownKey = start ? untrack(() => key) : '';
  let latest = 0;

  async function run(more = false) {
    const ticket = ++latest; // A slow older response must not overwrite newer results.
    const next = more ? pageNo + 1 : 1;
    error = '';
    loading = true;
    try {
      const params = new URLSearchParams({ page: String(next), ...(q ? { q } : {}), ...(category ? { category } : {}) });
      const r = await api.get<{ items: Medicine[]; hasMore: boolean }>(`/medicines?${params}`);
      if (ticket !== latest) return;
      items = more ? [...items, ...r.items] : r.items;
      hasMore = r.hasMore;
      pageNo = next;
      loaded = true;
    } catch (err) {
      if (ticket === latest) error = (err as Error).message;
    } finally {
      if (ticket === latest) loading = false;
    }
  }

  $effect(() => {
    if (key === shownKey) return;
    shownKey = key;
    void untrack(() => run());
  });

  /** Loads the next page as the end of the list comes near. */
  function autoMore(node: HTMLElement) {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loading && !error) void run(true);
    }, { rootMargin: '600px' });
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }

  onDestroy(() => {
    if (browser && loaded) visited.set(shownKey, { items, hasMore, pageNo });
  });
</script>

<div aria-busy={loading}>
  {#if error && !items.length}
    <div class="empty stack"><p>{error}</p><button class="btn" onclick={() => run()}>{m.retry()}</button></div>
  {:else if !loaded}
    <div class="grid" aria-hidden="true">{#each { length: 10 } as _, n (n)}<div class="ghost"></div>{/each}</div>
  {:else if items.length === 0}
    <div class="none"><p>{m.no_results()}</p></div>
  {:else}
    <div class="grid">{#each items as med (med.id)}<ProductCard medicine={med} />{/each}</div>
    <div class="foot">
      {#if total}<p class="muted small">{m.showing_count({ shown: items.length.toLocaleString(), total: total.toLocaleString() })}</p>{/if}
      {#if error}
        <p class="error">{error}</p>
        <button class="btn" onclick={() => run(true)}>{m.retry()}</button>
      {:else if hasMore}
        {#key pageNo}
          {#if pageNo < AUTO_PAGES}<span class="sentinel" use:autoMore></span>{/if}
        {/key}
        <button class="btn" disabled={loading} onclick={() => run(true)}>{m.load_more()}</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .grid { display: flex; flex-direction: column; gap: 10px; }
  .ghost { height: 88px; border-radius: var(--r); background: var(--raised); animation: pulse 1.2s ease-in-out infinite; }
  .none { padding: 36px 20px; border-radius: var(--r); background: var(--raised); box-shadow: var(--shadow); text-align: center; color: var(--muted); }
  .foot { display: flex; flex-direction: column; align-items: center; gap: 12px; margin-top: 16px; }
  .sentinel { width: 1px; height: 1px; }
  @keyframes pulse { 50% { opacity: 0.5; } }
  @media (min-width: 900px) { .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } }
</style>
