<script lang="ts">
  import { formatTk } from '@albarakah/domain';
  import { cart } from '#lib/app.svelte.ts';
  import FormGlyph from '#lib/FormGlyph.svelte';
  import { m } from '#lib/paraglide/messages.js';
  import Stepper from '#lib/Stepper.svelte';

  let { data } = $props();
  const med = $derived(data.medicine);
  const qty = $derived(cart.qtyOf(med.id));
  let photoFailed = $state(false);
</script>

<svelte:head>
  <title>{med.name} {med.strength} price · AL-BARAKAH</title>
  <meta name="description" content="{med.name} {med.strength} ({med.genericName}), {med.packSize}, by {med.manufacturer}. {formatTk(med.pricePoisha)}. Delivered in Bangladesh." />
</svelte:head>

<div class="page stack">
  <button class="btn ghost small back" onclick={() => history.back()}>‹ {m.back()}</button>
  <div class="row identity">
    {#if med.imageUrl && !photoFailed}
      <img class="photo" src={med.imageUrl} alt="" width="120" height="120" referrerpolicy="no-referrer" onerror={() => (photoFailed = true)} />
    {:else}
      <FormGlyph form={med.form} />
    {/if}
    <div class="grow">
      <h1 class="name">{med.name}</h1>
      {#if med.strength}<p class="strength">{med.strength}</p>{/if}
      {#if med.form}<p class="muted">{med.form}</p>{/if}
    </div>
  </div>
  <p class="mono price">{formatTk(med.pricePoisha)}</p>
  <div class="tags">
    {#if med.isRx}<span class="chip warn">{m.rx_required()}</span>{/if}
    {#if !med.inStock}<span class="chip off">{m.out_of_stock()}</span>{/if}
  </div>

  <div class="group">
    <div class="between"><span class="muted">{m.generic()}</span><span>{med.genericName}</span></div>
    {#if med.manufacturer}<div class="between"><span class="muted">{m.maker()}</span><span>{med.manufacturer}</span></div>{/if}
    {#if med.packSize}<div class="between"><span class="muted">{m.pack()}</span><span>{med.packSize}</span></div>{/if}
  </div>
  {#if med.description}<p>{med.description}</p>{/if}

  <div class="dock" class:gone={!med.inStock}>
    {#if !med.inStock}
      <span class="muted stock">{m.out_of_stock()}</span>
    {:else if qty}
      <Stepper {qty} label={med.name} onchange={(q) => cart.setQty(med.id, q)} />
      <a class="btn primary grow" href="/cart">{m.view_cart()}</a>
    {:else}
      <button class="btn primary block" onclick={() => cart.add(med)}>{m.add_to_cart()}</button>
    {/if}
  </div>
</div>

<style>
  .back { align-self: flex-start; padding-left: 0; }
  .identity { align-items: center; }
  .name { font-size: 1.75rem; line-height: 1.15; }
  .strength { margin-top: 4px; font-size: 1.15rem; font-weight: 600; }
  .price { font-size: 1.7rem; font-weight: 700; }
  .tags { display: flex; flex-wrap: wrap; gap: 8px; }
  .tags:empty { display: none; }
  .photo { flex: none; width: 112px; height: 112px; padding: 8px; border-radius: 20px; object-fit: contain; background: var(--sage-soft); }
  .between { justify-content: space-between; gap: 16px; }
  .between span:last-child { text-align: right; }
  .gone { justify-content: center; background: var(--surface); }
  .stock { font-weight: 600; }
</style>
