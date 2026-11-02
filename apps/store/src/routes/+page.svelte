<script lang="ts">
  import { formatTk } from '@albarakah/domain';
  import MedicineRow from '#lib/MedicineRow.svelte';
  import { m } from '#lib/paraglide/messages.js';

  let { data } = $props();
</script>

<svelte:head>
  <title>AL-BARAKAH: medicine delivery and doctors</title>
  <meta name="description" content="Order medicine for delivery in Bangladesh, with emergency delivery in one hour, and book a doctor by video or WhatsApp." />
</svelte:head>

<div class="page">
  <h1 class="title">{m.greeting()}</h1>
  <form action="/search" class="searchbox">
    <input class="input" type="search" name="q" placeholder={m.search_placeholder()} aria-label={m.tab_search()} />
  </form>

  <div class="promos">
    <a class="promo em" href="/search">
      <strong>{m.emergency_title()}</strong>
      <span class="small">
        {data.emergency.available ? m.emergency_body({ minutes: data.emergency.minutes, fee: formatTk(data.emergency.feePoisha) }) : m.emergency_closed()}
      </span>
    </a>
    <a class="promo" href="/doctors">
      <strong>{m.doctor_promo()}</strong>
      <span class="small">{m.doctor_promo_body({ fee: formatTk(data.doctorFee) })}</span>
    </a>
  </div>

  <h2 class="section">{m.categories()}</h2>
  <div class="scroller">
    {#each data.categories as c (c.id)}
      <a class="btn small" href="/search?category={c.slug}">{c.name}</a>
    {/each}
  </div>

  <h2 class="section">{m.popular()}</h2>
  <div class="group">
    {#each data.popular as med (med.id)}<MedicineRow medicine={med} />{/each}
  </div>
</div>

<style>
  .searchbox { margin-bottom: 12px; }
  .promos { display: grid; gap: 10px; }
  .promo { display: flex; flex-direction: column; gap: 2px; padding: 16px; border-radius: var(--r); background: var(--raised); }
  .em { background: var(--accent); color: var(--on-accent); }
  .scroller { display: flex; gap: 8px; margin: 0 -16px; padding: 0 16px; overflow-x: auto; scrollbar-width: none; }
  .scroller a { flex: none; background: var(--raised); }
  @media (min-width: 560px) { .promos { grid-template-columns: 1fr 1fr; } }
</style>
