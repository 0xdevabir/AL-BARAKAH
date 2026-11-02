<script lang="ts">
  import { OtpLogin } from '@albarakah/ui';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { api, homeFor, message } from '#lib/app.ts';

  let setup = $state<{ secret: string; otpauthUrl: string } | null>(null);
  let code = $state('');
  let error = $state('');
  let busy = $state(false);

  const needsTotp = $derived(api.user?.role === 'ADMIN' && !api.user.mfa);
  const notStaff = $derived(api.user?.role === 'CUSTOMER');

  async function route() {
    if (!api.user || notStaff) return;
    if (!needsTotp) { await goto(homeFor(api.user.role), { replace: true }); return; }
    if (!api.user.totpEnabled && !setup) {
      try { setup = await api.post('/auth/totp/setup'); } catch (err) { error = message(err); }
    }
  }
  onMount(async () => {
    if (!api.ready) await api.restore();
    await route();
  });

  async function verify(e: Event) {
    e.preventDefault();
    busy = true;
    error = '';
    try {
      await api.verifyTotp(code);
      await route();
    } catch (err) {
      error = message(err);
      code = '';
    } finally { busy = false; }
  }
</script>

<div class="page narrow stack">
  <h1 class="title staff-mark"><img src="/favicon.svg" alt="" width="28" height="28" />AL-BARAKAH Staff</h1>
  {#if !api.ready}
    <span class="muted">Loading…</span>
  {:else if !api.user}
    <OtpLogin
      {api}
      demoRoles={['ADMIN', 'RIDER', 'DOCTOR']}
      labels={{ phone: 'Mobile number', phoneHint: 'The number your admin registered', send: 'Send code', code: '6-digit code', codeHint: 'The code expires in 5 minutes.', verify: 'Verify', change: 'Use a different number', invalidPhone: 'Enter a valid Bangladeshi mobile number' }}
      ondone={route}
    />
  {:else if notStaff}
    <p>This number does not have a staff account. Ask an admin to add it.</p>
    <button class="btn" onclick={() => api.logout()}>Sign out</button>
  {:else if needsTotp}
    {#if setup}
      <div class="card stack">
        <strong>Turn on two-factor authentication</strong>
        <p class="small">Admins need this every time they sign in. Add this key to an authenticator app such as Google Authenticator, then enter the code it shows.</p>
        <a class="btn small" href={setup.otpauthUrl}>Open in authenticator app</a>
        <code class="mono small key">{setup.secret}</code>
      </div>
    {/if}
    <form class="stack" onsubmit={verify}>
      <label class="field"><span>Authenticator code</span>
        <input class="input mono" bind:value={code} inputmode="numeric" autocomplete="one-time-code" pattern={'[0-9]{6}'} maxlength="6" required />
      </label>
      <button class="btn primary" disabled={busy}>Verify</button>
    </form>
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</div>

<style>
  .staff-mark { display: flex; align-items: center; gap: 10px; }
  .staff-mark img { display: block; }
  .narrow { max-width: 420px; padding-top: 12vh; }
  .key { overflow-wrap: anywhere; user-select: all; }
</style>
