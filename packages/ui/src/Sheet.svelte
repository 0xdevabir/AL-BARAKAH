<script lang="ts">
  import type { Snippet } from 'svelte';

  let { open = $bindable(false), title, children }: { open?: boolean; title: string; children: Snippet } = $props();
  let dialog = $state<HTMLDialogElement>();

  // A native dialog gives us focus trapping, Escape and the backdrop with no extra code.
  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  });
</script>

<dialog
  bind:this={dialog}
  class="sheet"
  aria-label={title}
  onclose={() => (open = false)}
  onclick={(e) => { if (e.target === dialog) open = false; }}
>
  <div class="sheet-body">
    <div class="grab" aria-hidden="true"></div>
    <h2>{title}</h2>
    {@render children()}
  </div>
</dialog>

<style>
  .sheet {
    position: fixed; inset: auto 0 0; width: 100%; max-width: 560px; max-height: 88dvh; margin: 0 auto; padding: 0; border: 0;
    border-radius: var(--r-lg) var(--r-lg) 0 0; background: var(--bg); color: var(--ink);
  }
  .sheet[open] { animation: rise 0.28s var(--ease); }
  .sheet::backdrop { background: rgb(0 0 0 / 0.4); }
  .sheet-body { padding: 8px 20px calc(20px + env(safe-area-inset-bottom)); overflow-y: auto; }
  .grab { width: 36px; height: 5px; margin: 0 auto 12px; border-radius: 3px; background: var(--line); }
  h2 { margin: 0 0 16px; font-size: 1.15rem; }
  @keyframes rise { from { transform: translateY(100%); } }
  @media (min-width: 720px) {
    .sheet { inset: 0; margin: auto; height: fit-content; border-radius: var(--r-lg); }
  }
</style>
