<script lang="ts">
  import { formatTk } from '@albarakah/domain';
  import { fmtWhen } from '@albarakah/ui';
  import { onMount } from 'svelte';
  import { api, message, statusLabel } from '#lib/app.ts';

  interface Ledger { earnedPoisha: number; cashHeldPoisha: number; settledPoisha: number; entries: { id: string; type: string; amountPoisha: number; createdAt: string; note: string | null }[] }
  let ledger = $state<Ledger | null>(null);
  let error = $state('');

  onMount(async () => {
    try { ledger = await api.get<Ledger>('/delivery/ledger'); } catch (err) { error = message(err); }
  });
</script>

<div class="page stack">
  <h1 class="title">Earnings</h1>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if ledger}
    <div class="group">
      <div class="row between"><span>Earned</span><strong class="mono">{formatTk(ledger.earnedPoisha)}</strong></div>
      <div class="row between"><span>Cash to hand over</span><strong class="mono">{formatTk(ledger.cashHeldPoisha)}</strong></div>
      <div class="row between"><span>Handed over</span><span class="mono">{formatTk(ledger.settledPoisha)}</span></div>
    </div>
    <h2 class="section">Recent</h2>
    {#if ledger.entries.length === 0}<p class="empty">Nothing yet</p>{/if}
    <div class="group small">
      {#each ledger.entries as e (e.id)}
        <div class="row between"><span>{statusLabel(e.type)}<span class="muted line">{fmtWhen(e.createdAt)}</span></span><span class="mono">{formatTk(e.amountPoisha)}</span></div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .between { justify-content: space-between; }
  .line { display: block; }
</style>
