<script lang="ts">
import { injectAnalytics } from "@vercel/analytics/sveltekit";
import { browser } from "$app/environment";
import Header from "$lib/components/Header.svelte";
import "../app.css";

let { children } = $props();

if (browser) {
  injectAnalytics();
}
</script>

<div class="layout-root">
  <Header />
  <div class="page-content">
    {@render children()}
  </div>
</div>

<style>
  .layout-root {
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .page-content {
    flex: 1;
    overflow: auto;
  }
</style>
