<script lang="ts">
  import { browser } from '$app/env';
  import { onMount } from 'svelte';
  import Mark from './Mark.svelte';

  const KEY = 'ab-intro';
  // Match app.html's data-intro so a returning visit never paints a blocking splash.
  let play = $state(browser ? document.documentElement.dataset.intro === '1' : false);
  let leaving = $state(false);
  let timer = 0;

  function clearLock() {
    document.documentElement.dataset.intro = '0';
  }

  function finish() {
    if (!play || leaving) return;
    leaving = true;
    clearTimeout(timer);
    try { sessionStorage.setItem(KEY, '1'); } catch { /* private mode */ }
    clearLock(); // Unlock taps immediately — don't wait for the fade.
    setTimeout(() => { play = false; }, 360);
  }

  onMount(() => {
    if (document.documentElement.dataset.intro !== '1') {
      play = false;
      clearLock();
      return;
    }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      try { sessionStorage.setItem(KEY, '1'); } catch { /* private mode */ }
      play = false;
      clearLock();
      return;
    }
    play = true;
    timer = window.setTimeout(finish, 900);
    // Failsafe: never leave the shell non-interactive if something stalls.
    const failsafe = window.setTimeout(() => { clearLock(); play = false; }, 2000);
    return () => { clearTimeout(timer); clearTimeout(failsafe); };
  });
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') finish(); }} />

{#if play}
  <div class="intro" class:leaving aria-hidden="true">
    <div class="stage">
      <Mark size={88} />
      <p class="word">BarakaBari</p>
    </div>
  </div>
{/if}

<style>
  .intro {
    position: fixed; inset: 0; z-index: 80; display: grid; place-items: center;
    background: var(--bg);
  }
  /* If HTML already marked intro done (returning visit), never intercept taps. */
  :global(html[data-intro='0']) .intro { display: none !important; }
  .leaving { animation: fade 0.36s ease forwards; pointer-events: none; }
  .stage { display: grid; justify-items: center; gap: 18px; color: var(--accent); animation: settle 0.7s var(--ease, cubic-bezier(0.32, 0.72, 0, 1)) both; }
  .word { margin: 0; color: var(--accent-ink); font-size: 1.35rem; font-weight: 700; letter-spacing: -0.03em; }
  @keyframes settle { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: none; } }
  @keyframes fade { to { opacity: 0; visibility: hidden; } }
  @media (prefers-reduced-motion: reduce) { .intro { display: none; } }
</style>

