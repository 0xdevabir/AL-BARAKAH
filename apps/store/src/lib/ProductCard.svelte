<script lang="ts">
  import { formatTk } from '@albarakah/domain';
  import { cart, type Medicine } from '#lib/app.svelte.ts';
  import { m } from '#lib/paraglide/messages.js';
  import FormGlyph from './FormGlyph.svelte';
  import Stepper from './Stepper.svelte';

  let { medicine }: { medicine: Medicine } = $props();
  const qty = $derived(cart.qtyOf(medicine.id));
  let photoFailed = $state(false);
  const size = $derived([medicine.packSize, medicine.strength].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · '));
  const form = $derived(medicine.form?.trim() || '');
</script>

<article class="product">
  <a href="/medicine/{medicine.slug}" class="body">
    <span class="shot">
      {#if medicine.imageUrl && !photoFailed}
        <img src={medicine.imageUrl} alt="" width="160" height="160" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror={() => (photoFailed = true)} />
      {:else}
        <FormGlyph form={medicine.form} />
      {/if}
    </span>
    <span class="text">
      <strong class="name">{medicine.name}</strong>
      {#if size}<span class="muted meta">{size}</span>{/if}
      {#if form}<span class="muted small meta">{form}</span>{/if}
      {#if medicine.isRx}<span class="chip warn">{m.rx_tag()}</span>{/if}
    </span>
  </a>
  <div class="foot">
    <span class="price mono">{formatTk(medicine.pricePoisha)}</span>
    {#if !medicine.inStock}
      <span class="chip off">{m.out_of_stock()}</span>
    {:else if qty}
      <Stepper {qty} label={medicine.name} onchange={(q) => cart.setQty(medicine.id, q)} />
    {:else}
      <button type="button" class="btn small primary" aria-label="{m.add()} {medicine.name}" onclick={() => cart.add(medicine)}>{m.add()}</button>
    {/if}
  </div>
</article>

<style>
  .product {
    display: flex;
    flex-direction: column;
    min-width: 0;
    height: 100%;
    padding: 12px;
    border-radius: var(--r);
    background: var(--raised);
    box-shadow: var(--shadow);
    content-visibility: auto;
    contain-intrinsic-size: auto 220px;
  }
  .body {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }
  .shot {
    display: grid;
    place-items: center;
    width: 100%;
    aspect-ratio: 1 / 1;
    border-radius: 16px;
    background: #fff;
    box-shadow: inset 0 0 0 1px var(--line);
    overflow: hidden;
  }
  .shot img { width: 100%; height: 100%; padding: 10px; object-fit: contain; }
  .text { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0; }
  .name {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.25;
    letter-spacing: -0.01em;
  }
  .body:hover .name { color: var(--accent-ink); }
  .meta { max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 0.9rem; }
  .foot {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    margin-top: auto;
    padding-top: 10px;
    border-top: 1px solid var(--line);
  }
  .price { font-size: 1.05rem; font-weight: 700; letter-spacing: -0.02em; }
  .foot :global(.btn) { width: 100%; }
  .foot :global(.stepper) { width: 100%; justify-content: space-between; }
  .foot :global(.chip) { align-self: flex-start; }
  @media (min-width: 900px) {
    .product { padding: 14px; }
    .name { font-size: 1.05rem; }
    .price { font-size: 1.15rem; }
  }
</style>
