<script lang="ts">
  import { formatTk } from '@albarakah/domain';
  import { goto } from '$app/navigation';
  import { api, type Medicine } from '#lib/app.svelte.ts';
  import { m } from '#lib/paraglide/messages.js';

  const LIMIT = 6;

  let q = $state('');
  let items = $state<Medicine[]>([]);
  let open = $state(false);
  let active = $state(-1);
  let latest = 0;

  const seeAllIndex = $derived(items.length);
  const term = $derived(q.trim());

  $effect(() => {
    const value = term;
    const ticket = ++latest; // A slow older response must not overwrite newer suggestions.
    active = -1;
    if (value.length < 2) {
      items = [];
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const r = await api.get<{ items: Medicine[] }>(`/medicines?q=${encodeURIComponent(value)}`);
        if (ticket === latest) items = r.items.slice(0, LIMIT);
      } catch {
        if (ticket === latest) items = []; // Enter still opens the full search page.
      }
    }, 120);
    return () => clearTimeout(timer);
  });

  function seeAll() {
    open = false;
    void goto(term ? `/search?q=${encodeURIComponent(term)}` : '/search');
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      open = false;
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!items.length) return;
      e.preventDefault();
      open = true;
      const size = items.length + 1;
      active = e.key === 'ArrowDown' ? (active + 1) % size : (active <= 0 ? size : active) - 1;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && items[active]) {
        open = false;
        void goto(`/medicine/${items[active].slug}`);
      } else {
        seeAll();
      }
    }
  }
</script>

<div class="box" onfocusout={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) open = false; }}>
  <input
    class="input"
    type="search"
    role="combobox"
    aria-expanded={open && items.length > 0}
    aria-controls="search-suggestions"
    aria-autocomplete="list"
    aria-activedescendant={active >= 0 ? `suggestion-${active}` : undefined}
    aria-label={m.tab_search()}
    autocomplete="off"
    enterkeyhint="search"
    placeholder={m.search_placeholder()}
    bind:value={q}
    onfocus={() => (open = true)}
    oninput={() => (open = true)}
    {onkeydown}
  />
  {#if open && items.length}
    <div class="list" id="search-suggestions" role="listbox" tabindex="-1">
      {#each items as med, i (med.id)}
        <a id="suggestion-{i}" class="item" class:on={i === active} role="option" aria-selected={i === active} href="/medicine/{med.slug}" onclick={() => (open = false)}>
          {#if med.imageUrl}<img src={med.imageUrl} alt="" width="36" height="36" decoding="async" referrerpolicy="no-referrer" onerror={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = 'hidden')} />{:else}<span class="blank"></span>{/if}
          <span class="grow text">
            <strong>{med.name} {med.strength}</strong>
            <span class="muted small">{med.genericName} · {med.form}</span>
          </span>
          <span class="mono small">{formatTk(med.pricePoisha)}</span>
        </a>
      {/each}
      <a class="item all" class:on={active === seeAllIndex} role="option" aria-selected={active === seeAllIndex} href="/search?q={encodeURIComponent(term)}" onclick={() => (open = false)}>{m.see_all_results({ query: term })}</a>
    </div>
  {/if}
</div>

<style>
  .box { position: relative; }
  .list { position: absolute; z-index: 20; inset: calc(100% + 6px) 0 auto; overflow: hidden; border: 1px solid var(--line); border-radius: var(--r); background: var(--bg); box-shadow: 0 10px 28px rgb(0 0 0 / 0.16); }
  .item { display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 8px 12px; }
  .item:hover, .item.on { background: var(--raised); }
  .item img, .blank { flex: none; width: 36px; height: 36px; border-radius: 10px; object-fit: contain; background: var(--sage-soft); }
  .text { display: flex; flex-direction: column; min-width: 0; }
  .text strong, .text span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .all { justify-content: center; border-top: 1px solid var(--line); color: var(--accent-ink); font-weight: 600; }
</style>
