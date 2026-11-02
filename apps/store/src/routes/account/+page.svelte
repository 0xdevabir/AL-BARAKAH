<script lang="ts">
  import { Segmented } from '@albarakah/ui';
  import { onMount } from 'svelte';
  import { api } from '#lib/app.svelte.ts';
  import { m } from '#lib/paraglide/messages.js';
  import { getLocale, setLocale } from '#lib/paraglide/runtime.js';

  interface Address { id: string; label: string; line: string; zone: { name: string } }
  let addresses = $state<Address[]>([]);
  let error = $state('');
  let locale = $state(getLocale());

  $effect(() => {
    if (locale !== getLocale()) setLocale(locale);
  });

  onMount(async () => {
    if (!api.ready) await api.restore();
    if (api.user) load();
  });
  async function load() {
    try { addresses = await api.get<Address[]>('/addresses'); } catch (err) { error = (err as Error).message; }
  }
  async function remove(id: string) {
    try { await api.del(`/addresses/${id}`); await load(); } catch (err) { error = (err as Error).message; }
  }
</script>

<svelte:head><title>{m.tab_account()} · AL-BARAKAH</title></svelte:head>

<div class="page">
  <h1 class="title">{m.tab_account()}</h1>
  {#if api.user}
    <div class="card"><strong class="mono">{api.user.phone}</strong></div>
    <h2 class="section">{m.addresses()}</h2>
    {#if addresses.length}
      <div class="group">
        {#each addresses as a (a.id)}
          <div>
            <span class="grow"><strong>{a.label}</strong><span class="muted small line">{a.line} · {a.zone.name}</span></span>
            <button class="btn small danger" onclick={() => remove(a.id)}>{m.remove()}</button>
          </div>
        {/each}
      </div>
    {/if}
  {:else if api.ready}
    <a class="btn primary block" href="/login?next=/account">{m.sign_in()}</a>
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}

  <h2 class="section">{m.language()}</h2>
  <Segmented label={m.language()} bind:value={locale} options={[{ value: 'en', label: 'English' }, { value: 'bn', label: 'বাংলা' }]} />

  {#if api.user}
    <button class="btn danger block out" onclick={() => api.logout()}>{m.sign_out()}</button>
  {/if}
</div>

<style>
  .line { display: block; }
  .block { width: 100%; }
  .out { margin-top: 24px; }
</style>
