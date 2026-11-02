<script lang="ts">
  import type { ApiClient } from './api.svelte.js';

  interface Labels { phone: string; phoneHint: string; send: string; code: string; codeHint: string; verify: string; change: string; invalidPhone: string }
  let { api, labels, ondone }: { api: ApiClient; labels: Labels; ondone: () => void } = $props();

  let phone = $state('');
  let code = $state('');
  let sent = $state(false);
  let busy = $state(false);
  let error = $state('');

  const validPhone = $derived(/^(\+?88)?01[3-9]\d{8}$/.test(phone.replace(/[\s-]/g, '')));

  async function submit(e: Event) {
    e.preventDefault();
    error = '';
    if (!sent && !validPhone) { error = labels.invalidPhone; return; }
    busy = true;
    try {
      if (!sent) {
        await api.requestOtp(phone);
        sent = true;
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

<form onsubmit={submit} class="stack">
  {#if !sent}
    <label class="field">
      <span>{labels.phone}</span>
      <input class="input" name="phone" type="tel" inputmode="numeric" autocomplete="tel" placeholder="01XXXXXXXXX" bind:value={phone} required />
      <small class="muted">{labels.phoneHint}</small>
    </label>
    <button class="btn primary" disabled={busy}>{labels.send}</button>
  {:else}
    <label class="field">
      <span>{labels.code}</span>
      <input class="input mono" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" bind:value={code} required />
      <small class="muted">{labels.codeHint}</small>
    </label>
    <button class="btn primary" disabled={busy || code.length !== 6}>{labels.verify}</button>
    <button type="button" class="btn ghost" onclick={() => { sent = false; code = ''; error = ''; }}>{labels.change}</button>
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</form>
