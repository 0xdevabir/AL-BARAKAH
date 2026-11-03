<script lang="ts">
  import { onDestroy, type Snippet } from 'svelte';

  let {
    open = $bindable(false),
    title,
    dismissible = true,
    children,
  }: { open?: boolean; title: string; dismissible?: boolean; children: Snippet } = $props();
  let dialog = $state<HTMLDialogElement>();

  // A native dialog gives us focus trapping, Escape and the backdrop with no extra code.
  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  });

  onDestroy(() => {
    // Leaving the page must never leave a modal dialog stuck over the next route.
    try { dialog?.close(); } catch { /* already closed */ }
  });

  function onCancel(e: Event) {
    if (!dismissible) e.preventDefault();
  }

  function onBackdrop(e: MouseEvent) {
    if (e.target === dialog && dismissible) open = false;
  }
</script>

<dialog
  bind:this={dialog}
  class="sheet"
  aria-label={title}
  onclose={() => (open = false)}
  oncancel={onCancel}
  onclick={onBackdrop}
>
  <div class="sheet-body">
    {#if dismissible}<div class="grab" aria-hidden="true"></div>{/if}
    <h2>{title}</h2>
    {@render children()}
  </div>
</dialog>

<style>
  .sheet {
    position: fixed; inset: auto 0 0; width: 100%; max-width: 560px; max-height: 88dvh; margin: 0 auto; padding: 0; border: 0;
    border-radius: var(--r-lg) var(--r-lg) 0 0; background: var(--bg); color: var(--ink);
    overflow: hidden;
  }
  .sheet[open] { animation: rise 0.4s var(--ease, cubic-bezier(0.32, 0.72, 0, 1)); }
  .sheet::backdrop { background: rgb(0 0 0 / 0.42); animation: dim 0.28s ease; }
  .sheet-body {
    max-height: 88dvh;
    padding: 10px 20px calc(24px + env(safe-area-inset-bottom));
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y;
  }
  .grab { width: 36px; height: 5px; margin: 0 auto 12px; border-radius: 3px; background: var(--line); }
  h2 { margin: 0 0 18px; font-size: 1.35rem; font-weight: 700; letter-spacing: -0.02em; }
  @keyframes rise {
    from { transform: translateY(22%); opacity: 0.55; }
    to { transform: none; opacity: 1; }
  }
  @keyframes dim { from { opacity: 0; } to { opacity: 1; } }
  @media (min-width: 720px) {
    .sheet { inset: 0; margin: auto; height: fit-content; border-radius: var(--r-lg); }
    .sheet[open] { animation: settle 0.28s var(--ease, cubic-bezier(0.32, 0.72, 0, 1)); }
    .sheet-body { max-height: min(88dvh, 720px); }
    @keyframes settle { from { opacity: 0; transform: scale(0.97); } }
  }
  @media (prefers-reduced-motion: reduce) {
    .sheet[open], .sheet::backdrop { animation: none; }
  }
</style>
