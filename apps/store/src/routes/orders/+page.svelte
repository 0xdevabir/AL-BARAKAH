<script lang="ts">
  import { formatTk } from '@albarakah/domain';
  import { fmtWhen } from '@albarakah/ui';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { api } from '#lib/app.svelte.ts';
  import { m } from '#lib/paraglide/messages.js';

  interface Row { id: string; code: string; status: string; type: string; totalPoisha: number; promisedBy: string; items: { nameSnapshot: string; qty: number }[] }
  let orders = $state<Row[] | null>(null);
  let error = $state('');

  onMount(async () => {
    if (!api.ready) await api.restore();
    if (!api.user) { await goto('/login?next=/orders', { replace: true }); return; }
    try { orders = await api.get<Row[]>('/orders'); } catch (err) { error = (err as Error).message; }
  });
  const statusLabel = (s: string) => (m as unknown as Record<string, () => string>)[`status_${s}`]?.() ?? s;
</script>

<svelte:head><title>{m.tab_orders()} · AL-BARAKAH</title></svelte:head>

<div class="page">
  <h1 class="title">{m.tab_orders()}</h1>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if orders && orders.length === 0}
    <div class="empty stack"><p>{m.orders_empty()}</p><a class="btn" href="/search">{m.browse()}</a></div>
  {:else if orders}
    <div class="group">
      {#each orders as o (o.id)}
        <a href="/orders/{o.id}" class="chev">
          <span class="grow">
            <span class="row between"><strong class="mono small">{o.code}</strong><span class="chip" class:off={o.status === 'CANCELLED' || o.status === 'FAILED'}>{statusLabel(o.status)}</span></span>
            <span class="muted small line">{o.items.map((i) => `${i.nameSnapshot} × ${i.qty}`).join(', ')}</span>
            <span class="muted small line">{fmtWhen(o.promisedBy)} · <span class="mono">{formatTk(o.totalPoisha)}</span></span>
          </span>
        </a>
      {/each}
    </div>
  {/if}
</div>

<style>
  .line { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
</style>
