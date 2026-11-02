<script lang="ts">
  import { m } from '#lib/paraglide/messages.js';
  import { MOBILE } from '#lib/app.svelte.ts';

  // Empty until the iPhone app has an App Store page. The badge stays on the landing page.
  const IOS_APP_URL = '';
</script>

{#if !MOBILE}
  <div class="stores">
    <a class="badge" href="/download/al-barakah.apk?v=1.1.0" download="AL-BARAKAH.apk">
      <img src="/badges/google-play.svg" alt={m.android_app()} width="155" height="46" />
    </a>
    {#if IOS_APP_URL}
      <a class="badge" href={IOS_APP_URL}>
        <img src="/badges/app-store.svg" alt={m.ios_app()} width="155" height="46" />
      </a>
    {:else}
      <span class="badge" title={m.ios_app_pending()}>
        <img src="/badges/app-store.svg" alt="{m.ios_app()}. {m.ios_app_pending()}" width="155" height="46" />
      </span>
    {/if}
  </div>
{/if}

<style>
  .stores { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 4px; }
  .badge { display: block; line-height: 0; border-radius: 10px; }
  .badge img { width: 155px; height: 46px; }
  span.badge { cursor: default; }
</style>
