<script lang="ts">
  import { onMount } from 'svelte';
  import type { ApiClient } from './api.svelte.js';

  interface Labels {
    phone: string; phoneHint: string; send: string; code: string; codeHint: string; verify: string; change: string; invalidPhone: string;
    email?: string; emailHint?: string; invalidEmail?: string; usePhone?: string; useEmail?: string; phoneRequired?: string;
  }
  let {
    api, labels, ondone, demoRoles = [], channels = ['phone'] as ('phone' | 'email')[],
  }: {
    api: ApiClient;
    labels: Labels;
    ondone: () => void;
    demoRoles?: string[];
    channels?: ('phone' | 'email')[];
  } = $props();

  let demos = $state<string[]>([]);
  onMount(() => {
    api.get<{ roles: string[] }>('/auth/demo-accounts')
      .then((r) => { demos = demoRoles.filter((role) => r.roles.includes(role)); })
      .catch(() => undefined);
  });

  async function demoLogin(role: string) {
    error = '';
    busy = true;
    try {
      await api.demoLogin(role);
      ondone();
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }

  let channel = $state<'phone' | 'email'>(channels[0] ?? 'phone');
  let phone = $state('');
  let email = $state('');
  let code = $state('');
  let sent = $state(false);
  let busy = $state(true);
  onMount(() => { busy = false; });
  let error = $state('');

  const validPhone = $derived(/^(\+?88)?01[3-9]\d{8}$/.test(phone.replace(/[\s-]/g, '')));
  const validEmail = $derived(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()));
  const canEmail = $derived(channels.includes('email'));
  const canPhone = $derived(channels.includes('phone'));

  function switchChannel(next: 'phone' | 'email') {
    if (channel === next) return;
    channel = next;
    sent = false;
    code = '';
    error = '';
  }

  async function submit(e: Event) {
    e.preventDefault();
    error = '';
    if (!sent) {
      if (!validPhone) { error = labels.invalidPhone; return; }
      if (channel === 'email' && !validEmail) { error = labels.invalidEmail ?? 'Enter a valid email address'; return; }
    }
    busy = true;
    try {
      if (!sent) {
        if (channel === 'email') await api.requestEmailOtp(email.trim(), phone);
        else await api.requestOtp(phone);
        sent = true;
      } else if (channel === 'email') {
        await api.verifyEmailOtp(email.trim(), phone, code);
        ondone();
      } else {
        await api.verifyOtp(phone, code);
        ondone();
      }
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

{#if canPhone && canEmail && !sent}
  <div class="channels" role="tablist" aria-label="Sign-in method">
    <button type="button" role="tab" class="btn small" class:primary={channel === 'phone'} aria-selected={channel === 'phone'} onclick={() => switchChannel('phone')}>{labels.usePhone ?? 'Phone'}</button>
    <button type="button" role="tab" class="btn small" class:primary={channel === 'email'} aria-selected={channel === 'email'} onclick={() => switchChannel('email')}>{labels.useEmail ?? 'Email'}</button>
  </div>
{/if}

<form onsubmit={submit} class="stack">
  {#if !sent}
    {#if channel === 'email'}
      <label class="field">
        <span>{labels.email ?? 'Email'}</span>
        <input class="input" name="email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" bind:value={email} required />
        <small class="muted">{labels.emailHint ?? 'We will email a 6-digit code instantly.'}</small>
      </label>
      <label class="field">
        <span>{labels.phone}</span>
        <input class="input" name="phone" type="tel" inputmode="numeric" autocomplete="tel" placeholder="01XXXXXXXXX" bind:value={phone} required />
        <small class="muted">{labels.phoneRequired ?? labels.phoneHint}</small>
      </label>
    {:else}
      <label class="field">
        <span>{labels.phone}</span>
        <input class="input" name="phone" type="tel" inputmode="numeric" autocomplete="tel" placeholder="01XXXXXXXXX" bind:value={phone} required />
        <small class="muted">{labels.phoneHint}</small>
      </label>
    {/if}
    <button class="btn primary" disabled={busy}>{labels.send}</button>
  {:else}
    <label class="field">
      <span>{labels.code}</span>
      <input class="input mono" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern={'[0-9]{6}'} bind:value={code} required />
      <small class="muted">{labels.codeHint}</small>
    </label>
    <button class="btn primary" disabled={busy || code.length !== 6}>{labels.verify}</button>
    <button type="button" class="btn ghost" onclick={() => { sent = false; code = ''; error = ''; }}>{labels.change}</button>
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</form>

{#if demos.length}
  <section class="stack demo" aria-label="Demo sign-in">
    <p class="section">Demo login (testing only)</p>
    {#each demos as role (role)}
      <button type="button" class="btn" disabled={busy} onclick={() => demoLogin(role)}>
        Continue as {role[0] + role.slice(1).toLowerCase()}
      </button>
    {/each}
  </section>
{/if}

<style>
  .channels { display: flex; gap: 8px; margin-bottom: 16px; }
  .channels .btn { flex: 1; }
  .channels .btn:not(.primary) { background: var(--raised); }
  .demo { margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--line); }
</style>
