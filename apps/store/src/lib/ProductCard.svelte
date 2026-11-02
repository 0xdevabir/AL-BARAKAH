<script lang="ts">
  import { formatTk } from '@albarakah/domain';
  import { cart, type Medicine } from '#lib/app.svelte.ts';
  import { m } from '#lib/paraglide/messages.js';
  import FormGlyph from './FormGlyph.svelte';
  import Stepper from './Stepper.svelte';

  let { medicine }: { medicine: Medicine } = $props();
  const qty = $derived(cart.qtyOf(medicine.id));
  let photoFailed = $state(false);
</script>

<article class="card-item">
  <a href="/medicine/{medicine.slug}" class="link">
    <span class="shot">
      {#if medicine.imageUrl && !photoFailed}
        <img src={medicine.imageUrl} alt="" width="240" height="240" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror={() => (photoFailed = true)} />
      {:else}
        <FormGlyph form={medicine.form} />
      {/if}
      {#if medicine.isRx}<span class="chip warn rx">{m.rx_tag()}</span>{/if}
    </span>
    <strong class="name">{medicine.name} {medicine.strength}</strong>
    <span class="muted small clamp">{medicine.genericName}</span>
    <span class="muted small clamp">{medicine.form}{medicine.packSize ? `, ${medicine.packSize}` : ''}</span>
  </a>
  <div class="buy">
    <span class="price mono">{formatTk(medicine.pricePoisha)}</span>
    {#if !medicine.inStock}
      <span class="chip off">{m.out_of_stock()}</span>
    {:else if qty}
      <Stepper {qty} label={medicine.name} onchange={(q) => cart.setQty(medicine.id, q)} />
    {:else}
      <button class="btn small primary" aria-label="{m.add()} {medicine.name}" onclick={() => cart.add(medicine)}>{m.add()}</button>
    {/if}
  </div>
</article>

<style>
  /* Long lists stay smooth: the browser skips drawing cards that are off screen. */
  .card-item { display: flex; flex-direction: column; gap: 12px; min-width: 0; padding: 14px; border-radius: var(--r); background: var(--raised); box-shadow: var(--shadow); content-visibility: auto; contain-intrinsic-size: auto 340px; }
  .link { display: flex; flex: 1; flex-direction: column; gap: 2px; min-width: 0; border-radius: var(--r-sm); }
  .shot { position: relative; display: grid; place-items: center; aspect-ratio: 1; margin-bottom: 8px; border-radius: var(--r-sm); background: var(--bg); overflow: hidden; }
  .shot img { width: 100%; height: 100%; padding: 10px; object-fit: contain; }
  .rx { position: absolute; top: 6px; left: 6px; }
  .name { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; font-weight: 600; line-height: 1.25; }
  .link:hover .name { color: var(--accent-ink); }
  .clamp { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .buy { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px; min-height: 38px; }
  .price { font-size: 1.2rem; font-weight: 700; }
</style>
