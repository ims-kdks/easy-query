<script lang="ts">
import { onMount } from "svelte";
import { JsonLd, MetaTags } from "svelte-meta-tags";
import { dev } from "$app/environment";
import Modal from "$lib/components/Modal.svelte";
import StatusBar from "$lib/components/StatusBar.svelte";
import WelcomeScreen from "$lib/components/WelcomeScreen.svelte";
import WorkspaceView from "$lib/components/WorkspaceView.svelte";
import type { ExportFormat } from "$lib/duckdb/client";
import {
  databaseState,
  dropTable,
  executeQuery,
  executeWebMCPQuery,
  exportQueryResult,
  getPendingRestoreCount,
  initDatabase,
  listCatalogTables,
  loadDataFile,
  reconcileLoadedTables,
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
import { registerWebMCPTools, type TabRename } from "$lib/webmcp";
import type { WorkspaceTab } from "$lib/workspaceTabs";

const brand = "Easy Query";
const siteUrl = "https://csv-studio-plus.vercel.app";
const shareImage = `${siteUrl}/screenshot-v0.3.png`;
const pageDescription = `${brand} is a free, high-performance CSV/TSV/Parquet/JSON/JSONL viewer built with Svelte and DuckDB-Wasm. Run SQL and cross-table joins in your browser - no uploads required.`;
const ogTitle = `${brand} | Fast in-browser CSV/TSV/Parquet/JSON/JSONL viewer with SQL`;
const ogDescription = `Free, high-performance CSV/TSV/Parquet/JSON/JSONL viewer built with Svelte and DuckDB-Wasm. Run SQL and cross-table joins in your browser with ${brand}.`;
const demoTableNames = [
  "dataset_metadata",
  "neighborhoods",
  "stations",
  "vehicles",
  "riders",
  "weather_hourly",
  "trips",
  "maintenance_events",
];
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

let workspaceTabs = $state<WorkspaceTab[]>([]);
let activeTabId = $state<string | null>(null);
let activeTab = $derived(
  workspaceTabs.find((tab) => tab.id === activeTabId) ?? null,
);
let editorQuery = $derived(
  activeTab?.sql ?? buildDefaultTableQuery($databaseState.tables[0]?.name),
);
let showWelcome = $derived(workspaceTabs.length === 0);
let baseQuery = $state<string | null>(null);
let activeSort = $state<SortState | null>(null);
let activeFilter = $state<FilterState | null>(null);
let activeSearchTerm = $state("");
let nextResultId = 1;
let isWebMCPReady = $state(false);

function getFileType(fileName: string): string {
  return fileName.split(".").pop()?.toUpperCase() ?? "FILE";
}

function addFileTab(tableName: string) {
  const table = $databaseState.tables.find((item) => item.name === tableName);
  if (!table) return;

  const id = `table:${tableName}`;
  const sql = buildTableQuery(tableName);
  const existing = workspaceTabs.find((tab) => tab.id === id);
  const fileTab: WorkspaceTab = {
    id,
    name: existing?.name ?? tableName,
    type: getFileType(table.fileName),
    sql,
    tableName,
    fileName: table.fileName,
  };

  workspaceTabs = existing
    ? workspaceTabs.map((tab) => (tab.id === id ? fileTab : tab))
    : [...workspaceTabs, fileTab];
  activeTabId = id;
  setBaseQuery(sql);
}

function syncFileTabs() {
  for (const table of $databaseState.tables) {
    const id = `table:${table.name}`;
    if (!workspaceTabs.some((tab) => tab.id === id)) {
      workspaceTabs = [
        ...workspaceTabs,
        {
          id,
          name: table.name,
          type: getFileType(table.fileName),
          sql: buildTableQuery(table.name),
          tableName: table.name,
          fileName: table.fileName,
        },
      ];
    }
  }

  const lastTable = $databaseState.tables.at(-1);
  if (lastTable) {
    activeTabId = `table:${lastTable.name}`;
    setBaseQuery(buildTableQuery(lastTable.name));
  }
}

function createQueryTab(
  sql = "",
  name?: string,
  activate = true,
): WorkspaceTab {
  const id = `result:${nextResultId}`;
  const tab: WorkspaceTab = {
    id,
    name: name?.trim() || `Query ${nextResultId}`,
    type: "RESULT",
    sql,
  };
  nextResultId += 1;
  workspaceTabs = [...workspaceTabs, tab];
  if (activate || !activeTabId) {
    activeTabId = id;
  }
  return tab;
}

function ensureBaseQuery(): string {
  const resolved = stripTrailingSemicolons(
    baseQuery ||
      activeTab?.sql ||
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

async function loadFiles(files: File[]): Promise<number> {
  let loadedCount = 0;
  for (const file of files) {
    const tableName = await loadDataFile(file);
    if (tableName) {
      addFileTab(tableName);
      loadedCount += 1;
    }
  }
  return loadedCount;
}

async function handleFilesSelect(files: File[]) {
  await loadFiles(files);
}

async function handleLoadDemo() {
  isLoadingDemo = true;
  demoLoadError = null;

  try {
    const files = await Promise.all(
      demoTableNames.map(async (tableName) => {
        const fileName = `${tableName}.parquet`;
        const response = await fetch(`/demo/metro_move/${fileName}`);
        if (!response.ok) {
          throw new Error(`Could not download ${fileName}`);
        }
        return new File([await response.blob()], fileName, {
          type: "application/vnd.apache.parquet",
        });
      }),
    );

    const loadedCount = await loadFiles(files);
    if (loadedCount !== files.length) {
      throw new Error("Some demo tables could not be loaded");
    }
  } catch (error) {
    demoLoadError =
      error instanceof Error ? error.message : "Could not load demo data";
  } finally {
    isLoadingDemo = false;
  }
}

async function handleQuery(sql: string) {
  const query = stripTrailingSemicolons(sql);
  if (!query) return;

  const selectedTab = activeTab;
  if (selectedTab?.tableName) {
    const defaultQuery = buildTableQuery(selectedTab.tableName);
    if (query !== defaultQuery) {
      workspaceTabs = workspaceTabs.map((tab) =>
        tab.id === selectedTab.id ? { ...tab, sql: defaultQuery } : tab,
      );
      createQueryTab(query);
    }
  } else if (selectedTab) {
    workspaceTabs = workspaceTabs.map((tab) =>
      tab.id === selectedTab.id ? { ...tab, sql: query } : tab,
    );
  } else {
    createQueryTab(query);
  }

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

function handleEditorChange(sql: string) {
  if (!activeTabId) return;
  workspaceTabs = workspaceTabs.map((tab) =>
    tab.id === activeTabId ? { ...tab, sql } : tab,
  );
}

async function handleTabClick(tabId: string) {
  const tab = workspaceTabs.find((item) => item.id === tabId);
  if (!tab) return;

  activeTabId = tabId;
  const query = stripTrailingSemicolons(tab.sql);
  resetUiModifiers();

  if (!query || !isReadableQuery(query)) {
    baseQuery = null;
    return;
  }

  setBaseQuery(query);
  await executeQuery(query);
}

async function handleTabClose(tabId: string) {
  await closeTabs([tabId]);
}

function handleTabRename(tabId: string, name: string) {
  const trimmedName = name.trim();
  if (!trimmedName) return;

  workspaceTabs = workspaceTabs.map((tab) =>
    tab.id === tabId ? { ...tab, name: trimmedName } : tab,
  );
}

async function closeTabs(tabIds: string[]) {
  const requestedIds = [...new Set(tabIds)];
  const tabsById = new Map(workspaceTabs.map((tab) => [tab.id, tab]));
  const closed: string[] = [];
  const failed: Array<{ tab_id: string; error: string }> = [];

  for (const tabId of requestedIds) {
    const tab = tabsById.get(tabId);
    if (!tab) {
      failed.push({ tab_id: tabId, error: "Tab not found" });
      continue;
    }

    if (tab.tableName && !(await dropTable(tab.tableName))) {
      failed.push({ tab_id: tabId, error: "Failed to unload table" });
      continue;
    }

    closed.push(tabId);
  }

  const closedIds = new Set(closed);
  const activeIndex = workspaceTabs.findIndex((tab) => tab.id === activeTabId);
  const activeWasClosed = activeTabId ? closedIds.has(activeTabId) : false;
  workspaceTabs = workspaceTabs.filter((tab) => !closedIds.has(tab.id));

  if (activeWasClosed) {
    const nextTab =
      workspaceTabs[Math.min(activeIndex, workspaceTabs.length - 1)] ?? null;
    activeTabId = nextTab?.id ?? null;
    if (nextTab) {
      await handleTabClick(nextTab.id);
    } else {
      baseQuery = null;
      resetUiModifiers();
    }
  }

  return { ok: failed.length === 0, closed, failed };
}

async function handleWebMCPListTables(signal: AbortSignal) {
  return { ok: true, tables: await listCatalogTables(signal) };
}

function handleWebMCPListTabs() {
  return {
    ok: true,
    active_tab_id: activeTabId,
    tabs: workspaceTabs.map((tab) => ({
      id: tab.id,
      name: tab.name,
      type: tab.type,
      active: tab.id === activeTabId,
      table_name: tab.tableName ?? null,
      file_name: tab.fileName ?? null,
    })),
  };
}

function handleWebMCPCreateQueryTab(input: {
  name?: string;
  sql?: string;
  activate: boolean;
}) {
  const tab = createQueryTab(input.sql ?? "", input.name, input.activate);
  return {
    ok: true,
    tab: {
      id: tab.id,
      name: tab.name,
      type: tab.type,
      active: tab.id === activeTabId,
    },
  };
}

async function handleWebMCPActivateTab(tabId: string) {
  const tab = workspaceTabs.find((item) => item.id === tabId);
  if (!tab) return { ok: false, error: "Tab not found", tab_id: tabId };

  await handleTabClick(tabId);
  return {
    ok: true,
    tab_id: tabId,
    name: tab.name,
    query_error: $databaseState.error,
  };
}

function handleWebMCPRenameTabs(renames: TabRename[]) {
  const renamed: Array<{ tab_id: string; name: string }> = [];
  const failed: Array<{ tab_id: string; error: string }> = [];

  for (const rename of renames) {
    if (!workspaceTabs.some((tab) => tab.id === rename.tabId)) {
      failed.push({ tab_id: rename.tabId, error: "Tab not found" });
      continue;
    }
    handleTabRename(rename.tabId, rename.name);
    renamed.push({ tab_id: rename.tabId, name: rename.name.trim() });
  }

  return { ok: failed.length === 0, renamed, failed };
}

function handleWebMCPReadQuery(tabId: string) {
  const tab = workspaceTabs.find((item) => item.id === tabId);
  if (!tab) return { ok: false, error: "Tab not found", tab_id: tabId };
  return { ok: true, tab_id: tab.id, name: tab.name, sql: tab.sql };
}

function handleWebMCPWriteQuery(tabId: string, sql: string) {
  const tab = workspaceTabs.find((item) => item.id === tabId);
  if (!tab) return { ok: false, error: "Tab not found", tab_id: tabId };

  workspaceTabs = workspaceTabs.map((item) =>
    item.id === tabId ? { ...item, sql } : item,
  );
  return { ok: true, tab_id: tabId, sql };
}

async function handleWebMCPRunQuery(tabId: string, signal: AbortSignal) {
  const tab = workspaceTabs.find((item) => item.id === tabId);
  if (!tab) return { ok: false, error: "Tab not found", tab_id: tabId };

  const query = stripTrailingSemicolons(tab.sql);
  if (!query) return { ok: false, error: "Query is empty", tab_id: tabId };

  let resultTabId = tabId;
  if (tab.tableName) {
    const defaultQuery = buildTableQuery(tab.tableName);
    if (query !== defaultQuery) {
      workspaceTabs = workspaceTabs.map((item) =>
        item.id === tab.id ? { ...item, sql: defaultQuery } : item,
      );
      resultTabId = createQueryTab(query).id;
    } else {
      activeTabId = tabId;
    }
  } else {
    activeTabId = tabId;
  }

  if (isReadableQuery(query)) {
    setBaseQuery(query);
  } else {
    resetUiModifiers();
  }

  const result = await executeWebMCPQuery(query, signal);

  if (result.catalogChanged) {
    const catalogTables = await listCatalogTables(signal);
    reconcileLoadedTables(catalogTables);
    const mainTableNames = new Set(
      catalogTables
        .filter((catalogTable) => catalogTable.schema === "main")
        .map((catalogTable) => catalogTable.name),
    );
    workspaceTabs = workspaceTabs.filter(
      (workspaceTab) =>
        !workspaceTab.tableName || mainTableNames.has(workspaceTab.tableName),
    );
  }

  return {
    ok: result.ok,
    tab_id: resultTabId,
    sql: result.sql,
    statement_type: result.statementType,
    columns: result.columns,
    rows: result.rows,
    row_count: result.rowCount,
    execution_ms: result.executionMs,
    catalog_changed: result.catalogChanged,
    error: result.error,
  };
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
let isLoadingDemo = $state(false);
let demoLoadError = $state<string | null>(null);

$effect(() => {
  if (workspaceTabs.length === 0) {
    activeTabId = null;
  } else if (!workspaceTabs.some((tab) => tab.id === activeTabId)) {
    activeTabId = workspaceTabs[0].id;
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
      syncFileTabs();
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

async function initializePage(signal: AbortSignal) {
  await initDatabase();
  if (signal.aborted) return;

  // Try to auto-restore files with already-granted permission
  const restoredCount = await restoreFromStoredHandles();
  if (restoredCount > 0) {
    syncFileTabs();
    if (dev) {
      console.info(
        `Auto-restored ${restoredCount} file(s) from previous session`,
      );
    }
  }
  // Check if there are files that need permission re-granting
  pendingRestoreCount = await getPendingRestoreCount();

  isWebMCPReady = await registerWebMCPTools(
    {
      listTables: handleWebMCPListTables,
      listTabs: handleWebMCPListTabs,
      createQueryTab: handleWebMCPCreateQueryTab,
      activateTab: handleWebMCPActivateTab,
      closeTabs,
      renameTabs: handleWebMCPRenameTabs,
      readQuery: handleWebMCPReadQuery,
      writeQuery: handleWebMCPWriteQuery,
      runQuery: handleWebMCPRunQuery,
    },
    signal,
  );
}

onMount(() => {
  const controller = new AbortController();
  void initializePage(controller.signal).catch((error) => {
    if (dev) {
      console.error("Page initialization failed:", error);
    }
  });

  return () => controller.abort();
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
  <!-- Main Content -->
  <main class="main-content">
    {#if showWelcome}
      <WelcomeScreen
        {brand}
        {pendingRestoreCount}
        {isRestoring}
        {isLoadingDemo}
        {demoLoadError}
        onrestorependingfiles={handleRestorePendingFiles}
        ondemoload={handleLoadDemo}
        onfileselectmultiple={handleFilesSelect}
      />
    {:else}
      <WorkspaceView
        tables={$databaseState.tables}
        columns={$databaseState.columns}
        rows={$databaseState.rows}
        totalRows={$databaseState.totalRows}
        isQuerying={$databaseState.isQuerying}
        {isExporting}
        tabs={workspaceTabs}
        {activeTabId}
        query={editorQuery}
        searchValue={activeSearchTerm}
        onquery={handleQuery}
        onquerychange={handleEditorChange}
        onfileselectmultiple={handleFilesSelect}
        ontabclose={handleTabClose}
        ontabclick={handleTabClick}
        ontabrename={handleTabRename}
        onsearch={handleSearch}
        onsort={handleSort}
        onfilter={handleFilter}
        onopenexport={handleOpenExportDialog}
      />
    {/if}
  </main>

  <!-- Status Bar -->
  <StatusBar 
    totalRows={$databaseState.totalRows}
    queryTime={$databaseState.queryTime}
    error={$databaseState.error}
    isLoading={$databaseState.isLoading || $databaseState.isQuerying}
    {isWebMCPReady}
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
    height: 100%;
    overflow: hidden;
  }

  .main-content {
    flex: 1;
    display: flex;
    overflow: hidden;
  }
</style>
