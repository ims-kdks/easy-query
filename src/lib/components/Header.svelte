<script lang="ts">
import Icon from "./Icon.svelte";
import SearchInput from "./SearchInput.svelte";

const brand = "Easy Query";

interface Props {
  showWorkspaceActions?: boolean;
  searchValue?: string;
  isExporting?: boolean;
  isQuerying?: boolean;
  onsearch?: (searchTerm: string) => void;
  onopenexport?: () => void;
}

let {
  showWorkspaceActions = false,
  searchValue = "",
  isExporting = false,
  isQuerying = false,
  onsearch,
  onopenexport,
}: Props = $props();
</script>

<header class="flex-none bg-slate-900/80 backdrop-blur-sm border-b border-slate-700 px-4 py-3 z-20">
  <div class="flex items-center gap-4">
    <a href="/" class="flex items-center gap-3 hover:opacity-80 transition-opacity">
      <img src="/favicon.png" alt={brand} class="w-8 h-8 rounded-md" />
      <h1 class="text-lg font-semibold text-slate-100">{brand}</h1>
    </a>

    {#if showWorkspaceActions}
      <div class="ml-4 w-full max-w-md">
        <SearchInput
          value={searchValue}
          placeholder="Search all columns..."
          mode="enter"
          {onsearch}
        />
      </div>
      <button
        type="button"
        class="ml-auto inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        onclick={() => onopenexport?.()}
        disabled={isExporting || isQuerying}
      >
        {#if isExporting}
          <Icon name="spinner" class="w-4 h-4 animate-spin" />
          Exporting
        {:else}
          <Icon name="download" class="w-4 h-4" />
          Export
        {/if}
      </button>
    {/if}
  </div>
</header>
