<script lang="ts">
  import { formatTk } from '@albarakah/domain';
  import { cart, type Medicine } from '#lib/app.svelte.ts';
  import { m } from '#lib/paraglide/messages.js';
  import FormGlyph from './FormGlyph.svelte';
  import Stepper from './Stepper.svelte';

  let { medicine }: { medicine: Medicine } = $props();
  const qty = $derived(cart.qtyOf(medicine.id));
  let photoFailed = $state(false);
  // Size / strength first; form as a quiet second line so the card stays scannable.
  const size = $derived([medicine.packSize, medicine.strength].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · '));
  const form = $derived(medicine.form?.trim() || '');
</script>

<article class="card">
  <a href="/medicine/{medicine.slug}" class="link">
    <span class="shot">
      {#if medicine.imageUrl && !photoFailed}
        <img src={medicine.imageUrl} alt="" width="96" height="96" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror={() => (photoFailed = true)} />
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
  <div class="end">
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
  .card {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    padding: 14px;
    border-radius: var(--r);
    background: var(--raised);
    box-shadow: var(--shadow);
    content-visibility: auto;
    contain-intrinsic-size: auto 96px;
  }
  .link { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; }
  .shot {
    display: grid;
    place-items: center;
    flex: none;
    width: 72px;
    height: 72px;
    border-radius: 16px;
    background: #fff;
    box-shadow: inset 0 0 0 1px var(--line);
    overflow: hidden;
  }
  .shot img { width: 100%; height: 100%; padding: 6px; object-fit: contain; }
  .text { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; min-width: 0; }
  .name {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    font-weight: 700;
    line-height: 1.25;
    letter-spacing: -0.01em;
  }
  .link:hover .name { color: var(--accent-ink); }
  .meta { max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .end { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; flex: none; }
  .price { font-size: 1.15rem; font-weight: 700; letter-spacing: -0.02em; }
</style>
