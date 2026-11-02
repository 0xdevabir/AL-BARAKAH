<script lang="ts">
  import { formatTk } from '@albarakah/domain';
  import { cart, type Medicine } from '#lib/app.svelte.ts';
  import { m } from '#lib/paraglide/messages.js';
  import FormGlyph from './FormGlyph.svelte';
  import Stepper from './Stepper.svelte';

  let { medicine }: { medicine: Medicine } = $props();
  const qty = $derived(cart.qtyOf(medicine.id));
</script>

<div class="med">
  <a href="/medicine/{medicine.slug}" class="row grow">
    <FormGlyph form={medicine.form} />
    <span class="grow">
      <strong class="name">{medicine.name} {medicine.strength}</strong>
      <span class="muted small line">{medicine.genericName} · {medicine.form}</span>
      <span class="mono small">{formatTk(medicine.pricePoisha)}</span>
    </span>
  </a>
  {#if !medicine.inStock}
    <span class="chip off">{m.out_of_stock()}</span>
  {:else if qty}
    <Stepper {qty} label={medicine.name} onchange={(q) => cart.setQty(medicine.id, q)} />
  {:else}
    <button class="btn small" aria-label="{m.add()} {medicine.name}" onclick={() => cart.add(medicine)}>{m.add()}</button>
  {/if}
</div>

<style>
  .name, .line { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .name { font-weight: 600; }
</style>
