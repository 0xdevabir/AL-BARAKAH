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

  const initial = $derived((api.user?.name?.trim()?.[0] || api.user?.phone.slice(-2) || '').toUpperCase());

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
  <h1 class="title tab-title">{m.tab_account()}</h1>
  {#if api.user}
    <div class="group">
      <div class="who">
        <span class="avatar" aria-hidden="true">{initial}</span>
        <span class="grow">
          {#if api.user.name?.trim()}<strong>{api.user.name}</strong>{/if}
          <span class="mono" class:muted={!!api.user.name?.trim()}>{api.user.phone}</span>
        </span>
      </div>
    </div>

    <h2 class="section">{m.addresses()}</h2>
    {#if addresses.length}
      <div class="group">
        {#each addresses as a (a.id)}
          <div>
            <span class="grow">
              <strong>{a.label}</strong>
              <span class="muted small line">{a.line}</span>
              <span class="muted small line">{a.zone.name}</span>
            </span>
            <button class="remove" onclick={() => remove(a.id)}>{m.remove()}</button>
          </div>
        {/each}
      </div>
    {:else}
      <div class="empty soft"><p>{m.addresses_empty()}</p></div>
    {/if}
  {:else if api.ready}
    <div class="card guest">
      <p>{m.sign_in_body()}</p>
    </div>
    <a class="btn primary block sign" href="/login?next=/account">{m.sign_in()}</a>
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}

  <h2 class="section">{m.language()}</h2>
  <Segmented label={m.language()} bind:value={locale} options={[{ value: 'en', label: 'English' }, { value: 'bn', label: 'বাংলা' }]} />

  {#if api.user}
    <div class="group out">
      <button class="leave" onclick={() => api.logout()}>{m.sign_out()}</button>
    </div>
  {/if}
</div>

<style>
  .who { align-items: center; }
  .avatar { display: grid; place-items: center; flex: none; width: 56px; height: 56px; border-radius: 50%; background: var(--sage-soft); color: var(--accent-ink); font-size: 1.25rem; font-weight: 700; }
  .who .grow { display: flex; flex-direction: column; gap: 2px; }
  .line { display: block; }
  .soft { padding: 28px 20px; }
  .guest p { margin: 0; color: var(--muted); }
  .remove { flex: none; padding: 0; border: 0; background: none; color: var(--danger); font: inherit; font-weight: 600; cursor: pointer; }
  .sign { margin-top: 12px; }
  .out { margin-top: 28px; }
  .leave { justify-content: center; color: var(--danger); font-weight: 600; }
</style>
