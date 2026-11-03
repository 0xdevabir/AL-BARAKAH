<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { m } from '#lib/paraglide/messages.js';

  // Cold start sometimes lands on /index.html; that is not a real route — send them home.
  onMount(() => {
    const path = page.url.pathname;
    if (page.status === 404 && (path === '/index.html' || path.endsWith('/index.html') || path === '')) {
      void goto('/', { replace: true });
    }
  });
</script>

<div class="page">
  <div class="empty stack">
    <p>{page.status === 404 ? m.not_found() : m.retry()}</p>
    <a class="btn primary" href="/">{m.go_home()}</a>
  </div>
</div>
