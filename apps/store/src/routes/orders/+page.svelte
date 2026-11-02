<script lang="ts">
  import { formatTk } from '@albarakah/domain';
  import { fmtWhen } from '@albarakah/ui';
  import { onMount } from 'svelte';
  import { api } from '#lib/app.svelte.ts';
  import { m } from '#lib/paraglide/messages.js';

  interface Row {
    id: string; code: string; status: string; type: string; totalPoisha: number; promisedBy: string;
    addressSnapshot: { label?: string; line?: string } | null;
    items: { nameSnapshot: string; qty: number }[];
  }
  let orders = $state<Row[] | null>(null);
  let error = $state('');

  onMount(async () => {
    if (!api.ready) await api.restore();
    // Guests stay on this page and see the empty state — sign-in is only needed to place an order.
    if (!api.user) { orders = []; return; }
    try { orders = await api.get<Row[]>('/orders'); } catch (err) { error = (err as Error).message; }
  });
  const statusLabel = (s: string) => (m as unknown as Record<string, () => string>)[`status_${s}`]?.() ?? s;
</script>

<svelte:head><title>{m.tab_orders()} · AL-BARAKAH</title></svelte:head>

<div class="page">
  <h1 class="title tab-title">{m.tab_orders()}</h1>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if orders && orders.length === 0}
    <div class="empty stack"><p>{m.orders_empty()}</p><a class="btn primary" href="/search">{m.browse()}</a></div>
  {:else if orders}
    <div class="stack">
      {#each orders as o (o.id)}
        <a class="card order" href="/orders/{o.id}">
          <span class="row between">
            <span class="chip" class:off={o.status === 'DELIVERED' || o.status === 'CANCELLED'} class:warn={o.status === 'FAILED'}>{statusLabel(o.status)}</span>
            <span class="price">{formatTk(o.totalPoisha)}</span>
          </span>
          <strong class="items">{o.items.map((i) => `${i.nameSnapshot} × ${i.qty}`).join(', ') || o.code}</strong>
          {#if o.addressSnapshot?.line}
            <span class="where">{o.addressSnapshot.label}</span>
            <span class="muted">{o.addressSnapshot.line}</span>
          {/if}
          <span class="muted small">{fmtWhen(o.promisedBy)}</span>
        </a>
      {/each}
    </div>
  {/if}
</div>

<style>
  .order { display: flex; flex-direction: column; align-items: stretch; gap: 6px; }
  .items { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; line-height: 1.3; }
  .where { display: block; }
  .where { font-weight: 600; }
</style>

