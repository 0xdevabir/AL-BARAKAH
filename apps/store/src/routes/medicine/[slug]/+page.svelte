<script lang="ts">
  import { formatTk } from '@albarakah/domain';
  import { cart } from '#lib/app.svelte.ts';
  import FormGlyph from '#lib/FormGlyph.svelte';
  import { m } from '#lib/paraglide/messages.js';
  import Stepper from '#lib/Stepper.svelte';

  let { data } = $props();
  const med = $derived(data.medicine);
  const qty = $derived(cart.qtyOf(med.id));
</script>

<svelte:head>
  <title>{med.name} {med.strength} price · AL-BARAKAH</title>
  <meta name="description" content="{med.name} {med.strength} ({med.genericName}), {med.packSize}, by {med.manufacturer}. {formatTk(med.pricePoisha)}. Delivered in Bangladesh." />
</svelte:head>

<div class="page stack">
  <button class="btn ghost small back" onclick={() => history.back()}>‹ {m.back()}</button>
  <div class="row">
    <FormGlyph form={med.form} />
    <div class="grow">
      <h1 class="name">{med.name} {med.strength}</h1>
      <p class="muted">{med.form}</p>
    </div>
  </div>
  <p class="mono price">{formatTk(med.pricePoisha)}</p>
  {#if med.isRx}<div><span class="chip warn">{m.rx_required()}</span></div>{/if}

  <div class="group">
    <div class="between"><span class="muted">{m.generic()}</span><span>{med.genericName}</span></div>
    {#if med.manufacturer}<div class="between"><span class="muted">{m.maker()}</span><span>{med.manufacturer}</span></div>{/if}
    {#if med.packSize}<div class="between"><span class="muted">{m.pack()}</span><span>{med.packSize}</span></div>{/if}
  </div>
  {#if med.description}<p>{med.description}</p>{/if}

  {#if !med.inStock}
    <button class="btn block" disabled>{m.out_of_stock()}</button>
  {:else if qty}
    <div class="row between">
      <Stepper {qty} label={med.name} onchange={(q) => cart.setQty(med.id, q)} />
      <a class="btn primary grow" href="/cart">{m.view_cart()}</a>
    </div>
  {:else}
    <button class="btn primary block" onclick={() => cart.add(med)}>{m.add_to_cart()}</button>
  {/if}
</div>

<style>
  .back { align-self: flex-start; padding-left: 0; }
  .name { font-size: 1.5rem; line-height: 1.2; }
  .price { font-size: 1.4rem; }
  .between { justify-content: space-between; }
  .between span:last-child { text-align: right; }
</style>
