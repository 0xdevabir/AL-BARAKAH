<script lang="ts">
  import { formatTk } from '@albarakah/domain';
  import MedicineRow from '#lib/MedicineRow.svelte';
  import SearchBox from '#lib/SearchBox.svelte';
  import { m } from '#lib/paraglide/messages.js';

  let { data } = $props();

  const COMPANIES = ['Square', 'Incepta', 'Beximco', 'Renata', 'Eskayef', 'ACI', 'Opsonin', 'Healthcare'];
</script>

<svelte:head>
  <title>AL-BARAKAH: medicine delivery and doctors</title>
  <meta name="description" content="Order medicine for delivery in Bangladesh, with emergency delivery in one hour, and book a doctor by video or WhatsApp." />
</svelte:head>

<div class="page">
  <h1 class="title">{m.greeting()}</h1>
  <SearchBox />

  <h2 class="section">{m.categories()}</h2>
  <div class="cats">
    {#each data.categories as c (c.id)}
      <a class="cat" href="/search?category={c.slug}">
        <strong>{c.name}</strong>
        <span class="muted small mono">{c.count.toLocaleString()}</span>
      </a>
    {/each}
  </div>

  <h2 class="section">{m.browse_companies()}</h2>
  <div class="scroller">
    {#each COMPANIES as company (company)}
      <a class="btn small" href="/search?q={company}">{company}</a>
    {/each}
  </div>

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

  <h2 class="section">{m.popular()}</h2>
  <div class="group">
    {#each data.popular as med (med.id)}<MedicineRow medicine={med} />{/each}
  </div>
</div>

<style>
  .cats { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
  .cat { display: flex; flex-direction: column; justify-content: space-between; gap: 6px; min-height: 76px; padding: 12px; border-radius: var(--r); background: var(--raised); line-height: 1.25; transition: background 0.15s; }
  .cat:hover { background: var(--surface); }
  .promos { display: grid; gap: 10px; margin-top: 20px; }
  .promo { display: flex; flex-direction: column; gap: 2px; padding: 16px; border-radius: var(--r); background: var(--raised); }
  .em { background: var(--accent); color: var(--on-accent); }
  .scroller { display: flex; gap: 8px; margin: 0 -16px; padding: 0 16px; overflow-x: auto; scrollbar-width: none; }
  .scroller a { flex: none; background: var(--raised); }
  @media (min-width: 560px) { .promos { grid-template-columns: 1fr 1fr; } }
</style>
