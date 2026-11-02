<script lang="ts">
  import { OtpLogin } from '@albarakah/ui';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { api } from '#lib/app.svelte.ts';
  import { m } from '#lib/paraglide/messages.js';

  // Only same-site paths, so a crafted link cannot send someone elsewhere after sign-in.
  function next() {
    const n = page.url.searchParams.get('next') ?? '/';
    return n.startsWith('/') && !n.startsWith('//') ? n : '/';
  }
</script>

<svelte:head><title>{m.sign_in()} · AL-BARAKAH</title></svelte:head>

<div class="page narrow">
  <h1 class="title">{m.sign_in()}</h1>
  <p class="muted intro">{m.sign_in_body()}</p>
  <OtpLogin
    {api}
    labels={{ phone: m.phone(), phoneHint: m.phone_hint(), send: m.send_code(), code: m.code(), codeHint: m.code_hint(), verify: m.verify(), change: m.change_number(), invalidPhone: m.invalid_phone() }}
    ondone={() => goto(next(), { replace: true })}
  />
</div>

<style>
  .narrow { max-width: 420px; padding-top: 12vh; }
  .intro { margin-bottom: 20px; }
</style>
