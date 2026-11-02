<script lang="ts">
  import { formatTk } from '@albarakah/domain';
  import BrandLockup from '#lib/BrandLockup.svelte';
  import CategoryIcon from '#lib/CategoryIcon.svelte';
  import ProductGrid from '#lib/ProductGrid.svelte';
  import SearchBox from '#lib/SearchBox.svelte';
  import { m } from '#lib/paraglide/messages.js';

  let { data } = $props();

  const COMPANIES = ['Square', 'Incepta', 'Beximco', 'Renata', 'Eskayef', 'ACI', 'Opsonin', 'Healthcare'];
  const total = $derived(data.categories.reduce((n, c) => n + c.count, 0));
  // One pack of each kind, so the hero shows the range rather than three bottles of syrup.
  const packs = $derived(data.firstPage.items.filter((med, i, all) => med.imageUrl && all.findIndex((o) => o.form === med.form) === i).slice(0, 3));
</script>

<svelte:head>
  <title>AL-BARAKAH: medicine delivery and doctors</title>
  <meta name="description" content="Order medicine for delivery in Bangladesh, with emergency delivery in one hour, and book a doctor by video or WhatsApp." />
</svelte:head>

<div class="home">
  <div class="phone-top">
    <span class="logo"><BrandLockup size={26} /></span>
    <SearchBox />
  </div>

  <section class="hero">
    <div class="lead">
      <div class="lead-text">
        <h1>{m.greeting()}</h1>
        <p>{m.hero_sub({ count: total.toLocaleString() })}</p>
        <a class="cta" href="#medicines">{m.browse()}</a>
      </div>
      <div class="packs" aria-hidden="true">
        {#each packs as med (med.id)}
          <img src={med.imageUrl} alt="" width="150" height="150" decoding="async" referrerpolicy="no-referrer" onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />
        {/each}
      </div>
    </div>
    <a class="tile urgent" href="/search">
      <strong>{m.emergency_title()}</strong>
      {#if data.emergency.available}
        <span class="big">{m.minutes_short({ minutes: data.emergency.minutes })}</span>
        <span class="small">{m.emergency_extra({ fee: formatTk(data.emergency.feePoisha) })}</span>
      {:else}
        <span class="small">{m.emergency_closed()}</span>
      {/if}
    </a>
    <a class="tile doctor" href="/doctors">
      <strong>{m.doctor_promo()}</strong>
      <span class="big">{formatTk(data.doctorFee)}</span>
      <span class="small">{m.doctor_promo_short()}</span>
    </a>
  </section>

  <section>
    <div class="head">
      <h2>{m.categories()}</h2>
      <a href="/search">{m.see_all()}</a>
    </div>
    <div class="cat-grid">
      {#each data.categories as c (c.id)}
        <a class="cat" href="/search?category={c.slug}">
          <span class="icon"><CategoryIcon slug={c.slug} /></span>
          <span class="cat-name">{c.name}</span>
          <span class="muted small mono">{c.count.toLocaleString()}</span>
        </a>
      {/each}
    </div>
  </section>

  <section>
    <div class="head"><h2>{m.browse_companies()}</h2></div>
    <div class="companies">
      {#each COMPANIES as company (company)}
        <a href="/search?q={company}">{company}</a>
      {/each}
    </div>
  </section>

  <section id="medicines">
    <div class="head">
      <h2>{m.popular()}</h2>
      <a href="/search">{m.see_all()}</a>
    </div>
    <ProductGrid initial={data.firstPage} {total} />
  </section>

  <footer class="foot">
    <strong class="sign"><BrandLockup size={22} /></strong>
    <nav aria-label="Footer">
      <a href="/search">{m.tab_search()}</a>
      <a href="/doctors">{m.tab_doctors()}</a>
      <a href="/orders">{m.tab_orders()}</a>
      <a href="/account">{m.tab_account()}</a>
    </nav>
    <span class="muted small">{m.pay_cod()}, {m.pay_bkash()}</span>
  </footer>
</div>

<style>
  .home { --forest: #2b3d2a; display: flex; flex-direction: column; gap: 28px; width: 100%; max-width: 1320px; margin: 0 auto; padding: calc(12px + env(safe-area-inset-top)) 16px 32px; }
  section { scroll-margin-top: 88px; }

  .phone-top { display: flex; flex-direction: column; gap: 10px; }
  .logo { font-size: 1.12rem; }
  .sign { font-size: 1rem; font-weight: 700; }

  .hero { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .lead { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 24px 20px; overflow: hidden; border-radius: var(--r-lg); background: var(--forest); color: #fff; }
  .lead-text { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; }
  h1 { font-size: clamp(2.1rem, 9vw, 4rem); line-height: 1.02; font-weight: 700; letter-spacing: -0.035em; text-wrap: balance; }
  .lead p { max-width: 46ch; color: #d5dfd1; }
  .cta { display: inline-flex; align-items: center; min-height: 48px; margin-top: 4px; padding: 0 20px; border-radius: 14px; background: #fff; color: var(--forest); font-weight: 600; transition: background 0.15s; }
  .cta:hover { background: var(--sage-soft); }
  .packs { display: none; }

  .tile { display: flex; flex-direction: column; gap: 2px; min-height: 132px; padding: 16px; border-radius: var(--r-lg); transition: filter 0.15s; }
  .tile:hover { filter: brightness(0.97); }
  .tile strong { line-height: 1.2; }
  .big { margin-top: auto; font-size: clamp(1.6rem, 6vw, 2.4rem); line-height: 1.1; font-weight: 700; letter-spacing: -0.03em; }
  .urgent { background: var(--warn-soft); color: #5e3d00; }
  .doctor { background: var(--sage-soft); color: var(--forest); }

  .head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
  h2 { font-size: 1.3rem; line-height: 1.2; font-weight: 700; letter-spacing: -0.02em; }
  .head a { flex: none; color: var(--accent-ink); font-size: 0.925rem; font-weight: 600; }
  .head a:hover { text-decoration: underline; }

  /* Two rows that swipe sideways on a phone, so the medicines are not pushed far down. */
  .cat-grid { display: grid; grid-auto-flow: column; grid-auto-columns: 136px; grid-template-rows: 1fr 1fr; gap: 8px; margin: 0 -16px; padding: 0 16px; overflow-x: auto; scrollbar-width: none; }
  .cat { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 12px; border-radius: var(--r); background: var(--raised); transition: background 0.15s; }
  .cat:hover { background: var(--sage-soft); }
  .cat-name { flex: 1; font-size: 0.925rem; font-weight: 600; line-height: 1.2; }
  .icon { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; background: var(--sage-soft); color: var(--accent-ink); }
  .cat:hover .icon { background: var(--raised); }

  .companies { display: flex; gap: 8px; margin: 0 -16px; padding: 0 16px; overflow-x: auto; scrollbar-width: none; }
  .companies a { flex: 1 0 auto; display: grid; place-items: center; min-height: 52px; padding: 0 20px; border-radius: var(--r-sm); background: var(--raised); font-weight: 600; transition: background 0.15s; }
  .companies a:hover { background: var(--sage-soft); }

  .foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 24px; padding-top: 20px; border-top: 1px solid var(--line); }
  .foot nav { display: flex; flex-wrap: wrap; gap: 4px 18px; font-size: 0.925rem; }
  .foot nav a:hover { color: var(--accent-ink); text-decoration: underline; }

  @media (min-width: 900px) {
    .home { gap: 40px; padding: 20px 24px 32px; }
    .phone-top { display: none; }
    .hero { grid-template-columns: 3fr 1fr; gap: 14px; }
    .lead { grid-column: 1; grid-row: 1 / span 2; padding: 40px; min-height: 340px; }
    .tile { padding: 20px; }
    h2 { font-size: 1.6rem; }
    .cat-grid { grid-auto-flow: row; grid-template-rows: none; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); margin: 0; padding: 0; gap: 10px; }
    .cat { flex-direction: row; flex-wrap: wrap; align-items: center; column-gap: 10px; }
    .cat-name { flex: 1 1 calc(100% - 50px); min-width: 0; }
    .cat .muted { display: none; }
    .companies { margin: 0; padding: 0; }
  }
  @media (min-width: 1240px) {
    .packs { display: flex; flex: none; gap: 10px; }
    .packs img { width: 132px; height: 168px; padding: 8px; border-radius: var(--r); background: #fff; object-fit: contain; }
    .packs img:nth-child(2) { transform: translateY(-14px); }
  }
</style>

