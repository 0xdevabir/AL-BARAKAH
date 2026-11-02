<script lang="ts">
  import { browser } from '$app/env';
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

  async function run(more = false) {
    const ticket = ++latest; // A slow older response must not overwrite newer results.
    pageNo = more ? pageNo + 1 : 1;
    error = '';
    try {
      const params = new URLSearchParams({ page: String(pageNo), ...(q ? { q } : {}), ...(category ? { category } : {}) });
      const r = await api.get<{ items: Medicine[]; hasMore: boolean }>(`/medicines?${params}`);
      if (ticket !== latest) return;
      items = more ? [...items, ...r.items] : r.items;
      hasMore = r.hasMore;
      loaded = true;
    } catch (err) {
      if (ticket === latest) error = (err as Error).message;
    }
  }

  $effect(() => {
    void q; void category;
    if (!browser) return;
    const t = setTimeout(run, q ? 200 : 0);
    return () => clearTimeout(t);
  });
</script>

<svelte:head><title>{m.tab_search()} · AL-BARAKAH</title></svelte:head>

<div class="page">
  <h1 class="title">{m.tab_search()}</h1>
  <input class="input" type="search" bind:value={q} placeholder={m.search_placeholder()} aria-label={m.tab_search()} />
  <div class="results">
    {#if error}
      <div class="empty stack"><p>{error}</p><button class="btn" onclick={() => run()}>{m.retry()}</button></div>
    {:else if loaded && items.length === 0}
      <p class="empty">{m.no_results()}</p>
    {:else if items.length}
      <div class="group">{#each items as med (med.id)}<MedicineRow medicine={med} />{/each}</div>
      {#if hasMore}<button class="btn block more" onclick={() => run(true)}>{m.load_more()}</button>{/if}
    {/if}
  </div>
</div>

<style>
  .results { margin-top: 16px; }
  .more { margin-top: 12px; }
</style>
