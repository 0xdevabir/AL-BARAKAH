<script lang="ts">
  import { onMount } from 'svelte';
  import { CROSS } from './mark.ts';

  const KEY = 'ab-intro';
  let play = $state(true);
  let leaving = $state(false);
  let timer = 0;

  function finish() {
    if (!play || leaving) return;
    leaving = true;
    clearTimeout(timer);
    try { sessionStorage.setItem(KEY, '1'); } catch { /* private mode */ }
    setTimeout(() => {
      play = false;
      document.documentElement.dataset.intro = '0';
    }, 620);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') finish();
  }

  onMount(() => {
    if (document.documentElement.dataset.intro !== '1') {
      play = false;
      return;
    }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      try { sessionStorage.setItem(KEY, '1'); } catch { /* private mode */ }
      play = false;
      document.documentElement.dataset.intro = '0';
      return;
    }
    timer = window.setTimeout(finish, 2520);
    return () => clearTimeout(timer);
  });
</script>

<svelte:window onkeydown={onKey} />

{#if play}
  <div class="intro" class:leaving>
    <button type="button" class="skip" onclick={finish}>Skip</button>
    <div class="stage">
      <div class="glow" aria-hidden="true"></div>
      <svg class="mark" viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <clipPath id="ab-tile">
            <rect width="56" height="56" x="4" y="4" rx="16" />
          </clipPath>
          <linearGradient id="ab-liq" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stop-color="#3d5c38" />
            <stop offset="72%" stop-color="#5f7a57" />
            <stop offset="100%" stop-color="#8eae84" />
          </linearGradient>
          <linearGradient id="ab-beam" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#fff" stop-opacity="0" />
            <stop offset="50%" stop-color="#fff" stop-opacity="0.9" />
            <stop offset="100%" stop-color="#fff" stop-opacity="0" />
          </linearGradient>
        </defs>
        <rect class="guide" width="56" height="56" x="4" y="4" rx="16" fill="none" stroke="#b7c7b0" stroke-width="1.25" />
        <g clip-path="url(#ab-tile)">
          <g class="rise">
            <rect x="-48" y="14" width="170" height="90" fill="url(#ab-liq)" />
            <g class="slosh">
              <path fill="#f7fbf6" opacity="0.55" d="M-48 12C-30 4-14 20 4 12s30-8 46 0 32 8 48 0 30-6 46 2v10h-192Z" />
            </g>
            <g class="slosh slow">
              <path fill="#fff" opacity="0.28" d="M-48 14C-26 20-8 6 10 14s34 8 50 0 28-10 46-2 32 8 48 2v8h-192Z" />
            </g>
          </g>
        </g>
        <path d={CROSS} fill="#fff" />
        <path class="guide" d={CROSS} fill="none" stroke="#b7c7b0" stroke-width="1.25" />
        <g class="sheen" clip-path="url(#ab-tile)">
          <rect class="beam" x="-30" y="0" width="44" height="64" fill="url(#ab-beam)" />
        </g>
      </svg>
      <p class="word">AL-BARAKAH</p>
    </div>
  </div>
{/if}

<style>
  .intro {
    position: fixed; inset: 0; z-index: 80; display: grid; place-items: center;
    background-color: #f1f1f1; isolation: isolate; overflow: hidden;
  }
  :global(html[data-intro='0']) .intro:not(.leaving) { display: none; }
  .leaving { animation: lift 0.6s ease forwards; }
  .skip {
    position: absolute; top: calc(16px + env(safe-area-inset-top)); right: 16px;
    min-height: 36px; padding: 0 12px; border: 0; border-radius: 999px;
    background: transparent; color: var(--muted); font: inherit; font-size: 0.875rem; cursor: pointer;
  }
  .skip:hover { color: var(--ink); background: var(--surface); }
  .stage { position: relative; display: grid; justify-items: center; }
  .glow {
    position: absolute; top: 8px; left: 50%; width: 200px; height: 200px; border-radius: 50%;
    background: radial-gradient(circle, rgb(168 188 161 / 0.85), transparent 68%);
    filter: blur(8px); opacity: 0; transform: translateX(-50%) scale(0.75);
    animation: glow 1.7s 0.4s ease-out forwards;
  }
  .mark { position: relative; width: min(168px, 42vw); height: auto; }
  .rise { animation: rise 1.8s cubic-bezier(0.22, 0.72, 0.18, 1) forwards; }
  .slosh { animation: slosh 1.25s ease-in-out infinite; }
  .slow { animation-duration: 1.7s; animation-direction: reverse; }
  .guide { animation: guide 0.4s 1.45s ease forwards; }
  .beam { opacity: 0.42; transform: translateX(-36px) skewX(-18deg); animation: beam 0.8s 1.35s ease-out forwards; }
  .word {
    margin: 22px 0 0; color: #2b3d2a; font-size: clamp(1.35rem, 4vw, 1.7rem);
    font-weight: 700; letter-spacing: -0.03em; opacity: 0;
    animation: word 0.65s 1.15s cubic-bezier(0.2, 0.7, 0.2, 1) forwards;
  }
  @keyframes rise { from { transform: translateY(60px); } to { transform: translateY(-18px); } }
  @keyframes slosh { 50% { transform: translateX(-18px); } }
  @keyframes guide { to { opacity: 0; } }
  @keyframes glow {
    0% { opacity: 0; transform: translateX(-50%) scale(0.75); }
    100% { opacity: 1; transform: translateX(-50%) scale(1); }
  }
  @keyframes beam { from { transform: translateX(-36px) skewX(-18deg); } to { transform: translateX(78px) skewX(-18deg); } }
  @keyframes word { from { transform: translateY(8px); } to { opacity: 1; transform: none; } }
  @keyframes lift { to { opacity: 0; visibility: hidden; } }
  @media (prefers-reduced-motion: reduce) { .intro { display: none; } }
</style>
