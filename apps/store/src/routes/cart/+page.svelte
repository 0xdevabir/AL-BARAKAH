<script lang="ts">
  import { formatTk } from '@albarakah/domain';
  import { cart } from '#lib/app.svelte.ts';
  import FormGlyph from '#lib/FormGlyph.svelte';
  import { m } from '#lib/paraglide/messages.js';
  import Stepper from '#lib/Stepper.svelte';
</script>

<svelte:head><title>{m.cart()} · AL-BARAKAH</title></svelte:head>

<div class="page">
  <h1 class="title">{m.cart()}</h1>
  {#if cart.lines.length === 0}
    <div class="empty stack"><p>{m.cart_empty()}</p><a class="btn" href="/search">{m.browse()}</a></div>
  {:else}
    <div class="group">
      {#each cart.lines as l (l.id)}
        <div>
          <FormGlyph form={l.form} />
          <div class="grow">
            <strong>{l.name} {l.strength}</strong>
            <div class="mono small muted">{formatTk(l.pricePoisha * l.qty)}</div>
          </div>
          <Stepper qty={l.qty} label={l.name} onchange={(q) => cart.setQty(l.id, q)} />
        </div>
      {/each}
    </div>
    <div class="dock">
      <span class="grow"><span class="muted small">{m.subtotal()}</span><strong class="mono sum">{formatTk(cart.subtotal)}</strong></span>
      <a class="btn primary" href="/checkout">{m.checkout()}</a>
    </div>
  {/if}
</div>

<style>
  .sum { display: block; font-size: 1.15rem; }
</style>

