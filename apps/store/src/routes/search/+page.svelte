<script lang="ts">
  import { browser } from '$app/env';
  import { replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import ProductGrid from '#lib/ProductGrid.svelte';
  import { m } from '#lib/paraglide/messages.js';

  let q = $state(page.url.searchParams.get('q') ?? '');
  let appliedQ = $state(q); // Follows the input after a short pause, so each keystroke isn't a request.
  const category = $derived(page.url.searchParams.get('category') ?? '');
  const categories = $derived(page.data.categories as { id: string; name: string; slug: string; count: number }[]);
  // A text search has no known total, because it also matches similar spellings.
  const total = $derived(appliedQ.trim() ? undefined : category ? categories.find((c) => c.slug === category)?.count : categories.reduce((n, c) => n + c.count, 0));
  const chipHref = (slug: string) => {
    const params = new URLSearchParams({ ...(q.trim() ? { q: q.trim() } : {}), ...(slug ? { category: slug } : {}) });
    return `/search${params.size ? `?${params}` : ''}`;
  };

  $effect(() => {
    void q; void category;
    if (!browser) return;
    const t = setTimeout(() => {
      appliedQ = q;
      // Keeps the search shareable and restores it on Back, without adding a history entry per keystroke.
      const target = chipHref(category);
      if (target !== `${location.pathname}${location.search}`) replaceState(target, {});
    }, q ? 150 : 0);
    return () => clearTimeout(t);
  });
</script>

<svelte:head>
  <title>{m.tab_search()} · AL-BARAKAH</title>
  <meta name="description" content="Search medicines by brand or generic name and order for delivery in Bangladesh." />
</svelte:head>

<div class="page wide">
  <h1 class="title">{m.tab_search()}</h1>
  <input class="input find" type="search" bind:value={q} placeholder={m.search_placeholder()} aria-label={m.tab_search()} autocomplete="off" enterkeyhint="search" />
  {#if categories.length}
    <div class="chips">
      <a class="btn small" class:primary={!category} href={chipHref('')} data-sveltekit-replacestate data-sveltekit-noscroll>{m.all_categories()}</a>
      {#each categories as c (c.id)}
        <a class="btn small" class:primary={category === c.slug} href={chipHref(c.slug)} data-sveltekit-replacestate data-sveltekit-noscroll>{c.name}</a>
      {/each}
    </div>
  {/if}
  <div class="results"><ProductGrid q={appliedQ} {category} {total} /></div>
</div>

<style>
  .wide { max-width: 1320px; }
  .find { background: var(--raised); box-shadow: var(--shadow); border-radius: var(--r-sm); }
  .results { margin-top: 16px; }
  .chips { display: flex; gap: 10px; margin: 16px -20px 0; padding: 0 20px; overflow-x: auto; scrollbar-width: none; }
  .chips a { flex: none; }
  .chips a:not(.primary) { background: var(--raised); }
  @media (min-width: 900px) {
    .wide { padding-inline: 24px; }
    .chips { margin-inline: -24px; padding-inline: 24px; }
  }
</style>
