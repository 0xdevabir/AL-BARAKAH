<script lang="ts">
  import { OtpLogin } from '@albarakah/ui';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import BrandLockup from '#lib/BrandLockup.svelte';
  import { api } from '#lib/app.svelte.ts';
  import { m } from '#lib/paraglide/messages.js';

  // Only same-site paths, so a crafted link cannot send someone elsewhere after sign-in.
  function next() {
    const n = page.url.searchParams.get('next') ?? '/';
    return n.startsWith('/') && !n.startsWith('//') ? n : '/';
  }
</script>

<svelte:head><title>{m.sign_in()} · BarakaBari</title></svelte:head>

<div class="page narrow">
  <div class="brand"><BrandLockup size={30} /></div>
  <h1 class="title">{m.sign_in()}</h1>
  <p class="muted intro">{m.sign_in_body()}</p>
  <div class="card form">
    <OtpLogin
      {api}
      channels={['phone', 'email']}
      demoRoles={['CUSTOMER']}
      labels={{
        phone: m.phone(),
        phoneHint: m.phone_hint(),
        phoneRequired: m.phone_required_email(),
        send: m.send_code(),
        code: m.code(),
        codeHint: m.code_hint(),
        verify: m.verify(),
        change: m.change_number(),
        invalidPhone: m.invalid_phone(),
        email: m.email(),
        emailHint: m.email_hint(),
        invalidEmail: m.invalid_email(),
        usePhone: m.use_phone(),
        useEmail: m.use_email(),
      }}
      ondone={() => goto(next(), { replace: true })}
    />
  </div>
</div>

<style>
  .narrow { max-width: 420px; }
  .brand { margin: 8px 0 20px; }
  .title { margin-top: 0; }
  .intro { margin-bottom: 20px; max-width: 32ch; }
  .form { padding: 22px 20px; }
  .form :global(.btn.primary) { width: 100%; }
  .form :global(.demo) { margin-top: 20px; }
</style>
