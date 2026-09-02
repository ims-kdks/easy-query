<script lang="ts">
import { onMount } from "svelte";
import { JsonLd, MetaTags } from "svelte-meta-tags";
import { dev } from "$app/environment";
import Header from "$lib/components/Header.svelte";
import Modal from "$lib/components/Modal.svelte";
import StatusBar from "$lib/components/StatusBar.svelte";
import WelcomeScreen from "$lib/components/WelcomeScreen.svelte";
import WorkspaceView from "$lib/components/WorkspaceView.svelte";
import type { ExportFormat } from "$lib/duckdb/client";
import {
  databaseState,
  dropTable,
  executeQuery,
  exportQueryResult,
  getPendingRestoreCount,
  initDatabase,
  loadDataFile,
  restoreFromStoredHandles,
  restorePendingFiles,
} from "$lib/duckdb/client";
import {
  buildDefaultTableQuery,
  buildTableQuery,
  buildUiQuery,
  type FilterState,
  isReadableQuery,
  type SortDirection,
  type SortState,
  stripTrailingSemicolons,
} from "$lib/duckdb/uiQuery";

const brand = "Easy Query";
const siteUrl = "https://csv-studio-plus.vercel.app";
const shareImage = `${siteUrl}/screenshot-v0.7.png`;
const pageDescription = `${brand} is a free, high-performance CSV/TSV/Parquet/JSON/JSONL viewer built with Svelte and DuckDB-Wasm. Run SQL and cross-table joins in your browser - no uploads required.`;
const ogTitle = `${brand} | Fast in-browser CSV/TSV/Parquet/JSON/JSONL viewer with SQL`;
const ogDescription = `Free, high-performance CSV/TSV/Parquet/JSON/JSONL viewer built with Svelte and DuckDB-Wasm. Run SQL and cross-table joins in your browser with ${brand}.`;
const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: brand,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Web",
  url: siteUrl,
  image: shareImage,
  description: pageDescription,
};

let showWelcome = $derived($databaseState.tables.length === 0);
let activeTable = $state<string | null>(null);
let baseQuery = $state<string | null>(null);
let activeSort = $state<SortState | null>(null);
let activeFilter = $state<FilterState | null>(null);
let activeSearchTerm = $state("");
let editorQuery = $derived(
  baseQuery || buildDefaultTableQuery(activeTable ?? undefined),
);

function ensureBaseQuery(): string {
  const resolved = stripTrailingSemicolons(
    baseQuery ||
      $databaseState.lastQuery ||
      buildDefaultTableQuery($databaseState.tables[0]?.name),
  );

  if (!baseQuery) {
    baseQuery = resolved;
  }

  return resolved;
}

function resetUiModifiers() {
  activeSort = null;
  activeFilter = null;
  activeSearchTerm = "";
}

function setBaseQuery(sql: string) {
  baseQuery = stripTrailingSemicolons(sql);
  resetUiModifiers();
}

function applyUiQuery() {
  const hasFilter = Boolean(activeFilter?.value);
  const hasSearch = activeSearchTerm.length > 0;
  const hasSort = Boolean(activeSort);

  if (!hasFilter && !hasSearch && !hasSort) {
    executeQuery(ensureBaseQuery());
    return;
  }

  executeQuery(
    buildUiQuery({
      baseQuery: ensureBaseQuery(),
      activeFilter,
      activeSearchTerm,
      activeSort,
      columns: $databaseState.columns,
    }),
  );
}

async function handleFilesSelect(files: File[]) {
  for (const file of files) {
    const tableName = await loadDataFile(file);
    if (tableName) {
      activeTable = tableName;
    }
  }
}

async function handleQuery(sql: string) {
  const query = stripTrailingSemicolons(sql);
  if (!query) return;
  if (isReadableQuery(query)) {
    setBaseQuery(query);
  } else {
    resetUiModifiers();
  }
  await executeQuery(query);
}

function handleSort(data: { column: string; direction: SortDirection }) {
  const { column, direction } = data;
  if (direction === "none") {
    activeSort = null;
    applyUiQuery();
    return;
  }

  activeSort = { column, direction };
  applyUiQuery();
}

function handleFilter(data: { column: string; value: string }) {
  const value = data.value.trim();
  activeFilter = value ? { column: data.column, value } : null;
  applyUiQuery();
}

function handleSearch(searchTerm: string) {
  activeSearchTerm = searchTerm.trim();
  applyUiQuery();
}

function handleOpenExportDialog() {
  exportError = null;
  showExportDialog = true;
}

function handleTableClick(tableName: string) {
  activeTable = tableName;
  const query = buildTableQuery(tableName);
  setBaseQuery(query);
  executeQuery(query);
}

async function handleTableDelete(tableName: string) {
  const tableIndex = $databaseState.tables.findIndex(
    (table) => table.name === tableName,
  );
  const remainingTables = $databaseState.tables.filter(
    (table) => table.name !== tableName,
  );
  const nextTable =
    remainingTables[Math.min(tableIndex, remainingTables.length - 1)] ?? null;
  const wasActive = activeTable === tableName;

  await dropTable(tableName);

  if (wasActive) {
    activeTable = nextTable?.name ?? null;
    if (nextTable) {
      handleTableClick(nextTable.name);
    }
  }
}

async function handleExport(format: ExportFormat) {
  exportError = null;
  isExporting = true;

  try {
    await exportQueryResult(format);
    showExportDialog = false;
  } catch (error) {
    exportError = error instanceof Error ? error.message : "Export failed";
  } finally {
    isExporting = false;
  }
}

let showExportDialog = $state(false);
let isExporting = $state(false);
let exportError = $state<string | null>(null);
let pendingRestoreCount = $state(0);
let isRestoring = $state(false);

$effect(() => {
  const tables = $databaseState.tables;
  if (tables.length === 0) {
    activeTable = null;
    return;
  }
  if (!activeTable || !tables.some((table) => table.name === activeTable)) {
    activeTable = tables[0].name;
  }
});

$effect(() => {
  const lastQuery = $databaseState.lastQuery;
  if (!lastQuery) return;

  const hasUiModifiers =
    activeSort !== null || activeFilter !== null || activeSearchTerm.length > 0;
  if (hasUiModifiers) return;

  const normalizedLastQuery = stripTrailingSemicolons(lastQuery);
  if (!isReadableQuery(normalizedLastQuery)) return;

  if (baseQuery !== normalizedLastQuery) {
    baseQuery = normalizedLastQuery;
  }
});

async function handleRestorePendingFiles() {
  isRestoring = true;
  try {
    const restoredCount = await restorePendingFiles();
    if (restoredCount > 0) {
      activeTable = $databaseState.tables.at(-1)?.name ?? null;
      if (dev) {
        console.info(`Restored ${restoredCount} file(s) from previous session`);
      }
    }
    // Update pending count after restore
    pendingRestoreCount = await getPendingRestoreCount();
  } finally {
    isRestoring = false;
  }
}

onMount(async () => {
  await initDatabase();
  // Try to auto-restore files with already-granted permission
  const restoredCount = await restoreFromStoredHandles();
  if (restoredCount > 0) {
    activeTable = $databaseState.tables.at(-1)?.name ?? null;
    if (dev) {
      console.info(
        `Auto-restored ${restoredCount} file(s) from previous session`,
      );
    }
  }
  // Check if there are files that need permission re-granting
  pendingRestoreCount = await getPendingRestoreCount();
});
</script>

<MetaTags
  title={`${brand} | Fast in-browser CSV/TSV/Parquet/JSON/JSONL viewer with SQL (DuckDB-Wasm + Svelte)`}
  description={pageDescription}
  canonical={siteUrl}
  openGraph={{
    type: 'website',
    url: siteUrl,
    title: ogTitle,
    description: ogDescription,
    images: [{ url: shareImage, alt: `${brand} interface screenshot` }]
  }}
  twitter={{
    cardType: 'summary_large_image',
    title: ogTitle,
    description: ogDescription,
    image: shareImage,
    imageAlt: `${brand} interface screenshot`
  }}
/>
<JsonLd schema={structuredData} />

<div class="page-container">
  <Header
    showWorkspaceActions={!showWelcome}
    searchValue={activeSearchTerm}
    isQuerying={$databaseState.isQuerying}
    {isExporting}
    onsearch={handleSearch}
    onopenexport={handleOpenExportDialog}
  />

  <!-- Main Content -->
  <main class="main-content">
    {#if showWelcome}
      <WelcomeScreen
        {brand}
        {pendingRestoreCount}
        {isRestoring}
        onrestorependingfiles={handleRestorePendingFiles}
        onfileselectmultiple={handleFilesSelect}
      />
    {:else}
      <WorkspaceView
        tables={$databaseState.tables}
        columns={$databaseState.columns}
        rows={$databaseState.rows}
        totalRows={$databaseState.totalRows}
        isQuerying={$databaseState.isQuerying}
        {activeTable}
        query={editorQuery}
        onquery={handleQuery}
        onfileselectmultiple={handleFilesSelect}
        ontabledelete={handleTableDelete}
        ontableclick={handleTableClick}
        onsort={handleSort}
        onfilter={handleFilter}
      />
    {/if}
  </main>

  <!-- Status Bar -->
  <StatusBar 
    totalRows={$databaseState.totalRows}
    queryTime={$databaseState.queryTime}
    error={$databaseState.error}
    isLoading={$databaseState.isLoading || $databaseState.isQuerying}
  />
</div>

<Modal
  open={showExportDialog}
  title="Export results"
  onclose={() => {
    showExportDialog = false;
    exportError = null;
  }}
  size="sm"
>
  <div class="space-y-3">
    <p class="text-slate-400">Download the current query result.</p>
    {#if exportError}
      <p class="text-sm text-red-400">{exportError}</p>
    {/if}
    <div class="grid gap-2">
      <button
        type="button"
        class="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:border-emerald-500 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-60"
        onclick={() => handleExport('csv')}
        disabled={isExporting}
      >
        Export as CSV
      </button>
      <button
        type="button"
        class="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:border-emerald-500 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-60"
        onclick={() => handleExport('tsv')}
        disabled={isExporting}
      >
        Export as TSV
      </button>
      <button
        type="button"
        class="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:border-emerald-500 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-60"
        onclick={() => handleExport('parquet')}
        disabled={isExporting}
      >
        Export as Parquet
      </button>
    </div>
  </div>
</Modal>

<style>
  .page-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }

  .main-content {
    flex: 1;
    display: flex;
    overflow: hidden;
  }
</style>
