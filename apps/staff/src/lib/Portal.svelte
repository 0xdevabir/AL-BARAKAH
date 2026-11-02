<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { api, homeFor } from '#lib/app.ts';

  let { role, tabs, children }: { role: 'ADMIN' | 'RIDER' | 'DOCTOR'; tabs: { href: string; label: string }[]; children: Snippet } = $props();

  // Sends anyone in the wrong portal home. The API still enforces every permission on its own.
  const allowed = $derived(api.user?.role === role && (role !== 'ADMIN' || !!api.user.mfa));

  onMount(async () => {
    if (!api.ready) await api.restore();
    if (!allowed) await goto(api.user && !(api.user.role === 'ADMIN' && !api.user.mfa) ? homeFor(api.user.role) : '/', { replace: true });
  });
  async function signOut() {
    await api.logout();
    await goto('/', { replace: true });
  }
  const on = (href: string) => (tabs[0].href === href ? page.url.pathname === href : page.url.pathname.startsWith(href));
</script>

{#if allowed}
  <div class="shell">
    <nav aria-label="Sections">
      <strong class="brand"><img src="/favicon.svg" alt="" width="22" height="22" />AL-BARAKAH</strong>
      <div class="links">
        {#each tabs as t (t.href)}
          <a href={t.href} class:on={on(t.href)} aria-current={on(t.href) ? 'page' : undefined}>{t.label}</a>
        {/each}
      </div>
      <button class="btn ghost small" onclick={signOut}>Sign out</button>
    </nav>
    <main>{@render children()}</main>
  </div>
{/if}

<style>
  nav { position: sticky; top: 0; z-index: 5; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; padding: 8px 12px; background: var(--bg); border-bottom: 1px solid var(--line); }
  .brand { display: inline-flex; align-items: center; gap: 8px; color: var(--accent-ink); }
  .brand img { display: block; }
  .links { order: 3; display: flex; gap: 4px; width: 100%; overflow-x: auto; scrollbar-width: none; }
  .links a { flex: none; display: flex; align-items: center; min-height: 40px; padding: 0 12px; border-radius: 10px; color: var(--muted); font-weight: 500; }
  .links a.on { background: var(--surface); color: var(--ink); }
  nav button { margin-left: auto; }
  main { min-width: 0; }
  @media (min-width: 900px) {
    .shell { display: grid; grid-template-columns: 220px minmax(0, 1fr); min-height: 100dvh; }
    nav { position: sticky; top: 0; flex-direction: column; flex-wrap: nowrap; align-items: stretch; height: 100dvh; padding: 24px 12px; border-bottom: 0; border-right: 1px solid var(--line); }
    .brand { padding: 0 12px 16px; }
    .links { order: 0; flex: 1; flex-direction: column; overflow: visible; }
    nav button { margin: 0; }
  }
</style>
