<script lang="ts">
  import type { Snippet } from 'svelte';
  import Portal from '#lib/Portal.svelte';

  let { children }: { children: Snippet } = $props();
  const tabs = [
    { href: '/admin', label: 'Orders' },
    { href: '/admin/medicines', label: 'Medicines' },
    { href: '/admin/consultations', label: 'Bookings' },
    { href: '/admin/people', label: 'People' },
    { href: '/admin/settings', label: 'Fees and zones' },
  ];
</script>

<Portal role="ADMIN" {tabs}>{@render children()}</Portal>
