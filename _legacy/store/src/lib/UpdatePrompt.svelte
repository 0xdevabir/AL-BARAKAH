<script lang="ts">
  import { Sheet } from '@albarakah/ui';
  import { onMount } from 'svelte';
  import { MOBILE, openPayment, tap } from '#lib/app.svelte.ts';
  import { m } from '#lib/paraglide/messages.js';

  interface Remote {
    androidLatestVersionCode: number;
    androidLatestVersionName: string;
    androidApkUrl: string;
    androidForceUpdate: boolean;
    androidUpdateNotes: string;
  }

  let open = $state(false);
  let force = $state(false);
  let versionName = $state('');
  let notes = $state('');
  let apkUrl = $state('');

  onMount(() => {
    if (!MOBILE) return;
    let cancelled = false;

    void (async () => {
      // Let the intro finish, then check — feels calmer than a popup on a blank shell.
      await new Promise((r) => setTimeout(r, 1100));
      if (cancelled) return;

      try {
        const [{ App }, remote] = await Promise.all([
          import('@capacitor/app'),
          fetch(`${import.meta.env.VITE_API_BASE}/settings/public`).then((r) => (r.ok ? (r.json() as Promise<Remote>) : null)),
        ]);
        if (!remote || cancelled) return;

        const latest = Number(remote.androidLatestVersionCode) || 0;
        if (latest <= 0) return;

        const info = await App.getInfo();
        const local = Number(info.build) || 0;
        if (local >= latest) return;

        versionName = remote.androidLatestVersionName || String(latest);
        notes = remote.androidUpdateNotes?.trim() || '';
        apkUrl = remote.androidApkUrl;
        force = !!remote.androidForceUpdate;
        open = true;
      } catch {
        /* Offline or old API — skip quietly. */
      }
    })();

    return () => { cancelled = true; };
  });

  async function install() {
    tap();
    if (!apkUrl) return;
    await openPayment(apkUrl);
    if (!force) open = false;
  }
</script>

{#if MOBILE}
  <Sheet bind:open title={m.update_title()} dismissible={!force}>
    <div class="stack">
      <p class="body">{m.update_body({ version: versionName })}</p>
      {#if notes}<p class="notes muted small">{notes}</p>{/if}
      <button class="btn primary block" type="button" onclick={install}>{m.update_now()}</button>
      {#if !force}
        <button class="btn ghost block" type="button" onclick={() => (open = false)}>{m.update_later()}</button>
      {/if}
    </div>
  </Sheet>
{/if}

<style>
  .body { margin: 0; max-width: 34ch; color: var(--ink); }
  .notes { margin: 0; white-space: pre-wrap; }
  .stack { gap: 14px; }
  .stack :global(.btn.ghost) { color: var(--muted); }
</style>
