<script lang="ts">
import { onDestroy, tick } from "svelte";
import type { ColumnInfo, TableInfo } from "$lib/duckdb/client";
import type { SortDirection } from "$lib/duckdb/uiQuery";
import {
  isFileDragEvent,
  partitionSupportedDataFiles,
  SUPPORTED_DATA_FILE_EXTENSIONS,
  storeDroppedFileHandles,
} from "$lib/fileUpload";
import type { WorkspaceTab } from "$lib/workspaceTabs";
import DataTable from "./DataTable.svelte";
import FileUpload from "./FileUpload.svelte";
import Icon from "./Icon.svelte";
import SearchInput from "./SearchInput.svelte";
import SQLEditor from "./SQLEditor.svelte";

interface Props {
  tables: TableInfo[];
  tabs: WorkspaceTab[];
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  totalRows: number;
  isQuerying: boolean;
  isExporting: boolean;
  activeTabId: string | null;
  query: string;
  searchValue: string;
  onquery?: (sql: string) => void | Promise<void>;
  onquerychange?: (sql: string) => void;
  onfileselectmultiple?: (files: File[]) => void | Promise<void>;
  ontabclose?: (tabId: string) => void | Promise<void>;
  ontabclick?: (tabId: string) => void | Promise<void>;
  ontabrename?: (tabId: string, name: string) => void;
  onsearch?: (searchTerm: string) => void;
  onsort?: (data: { column: string; direction: SortDirection }) => void;
  onfilter?: (data: { column: string; value: string }) => void;
  onopenexport?: () => void;
}

let {
  tables,
  tabs,
  columns,
  rows,
  totalRows,
  isQuerying,
  isExporting,
  activeTabId,
  query,
  searchValue,
  onquery,
  onquerychange,
  onfileselectmultiple,
  ontabclose,
  ontabclick,
  ontabrename,
  onsearch,
  onsort,
  onfilter,
  onopenexport,
}: Props = $props();

// Panel width persistence
const MIN_PANEL_WIDTH = 240;
const MAX_PANEL_WIDTH = 800;
const DEFAULT_PANEL_WIDTH = 384; // w-96 = 24rem = 384px
let panelWidth = $state(DEFAULT_PANEL_WIDTH);
let isCollapsed = $state(false);
let isResizing = $state(false);

// Tables section height persistence
const MIN_TABLES_HEIGHT = 120;
const DEFAULT_TABLES_HEIGHT = 200;
let tablesHeight = $state(DEFAULT_TABLES_HEIGHT);
let isResizingTables = $state(false);
let isDropActive = $state(false);
let pageDragDepth = 0;
let feedbackMessage = $state<string | null>(null);
let feedbackTimer: ReturnType<typeof setTimeout> | null = null;
let editingTabId = $state<string | null>(null);
let renameValue = $state("");
let renameInput: HTMLInputElement | null = $state(null);

// Load persisted state on mount
$effect(() => {
  const savedWidth = localStorage.getItem("csvstudio:panelWidth");
  const savedCollapsed = localStorage.getItem("csvstudio:panelCollapsed");
  const savedTablesHeight = localStorage.getItem("csvstudio:tablesHeight");

  if (savedWidth) {
    const width = Number.parseInt(savedWidth, 10);
    if (
      !Number.isNaN(width) &&
      width >= MIN_PANEL_WIDTH &&
      width <= MAX_PANEL_WIDTH
    ) {
      panelWidth = width;
    }
  }
  if (savedCollapsed === "true") {
    isCollapsed = true;
  }
  if (savedTablesHeight) {
    const height = Number.parseInt(savedTablesHeight, 10);
    if (!Number.isNaN(height) && height >= MIN_TABLES_HEIGHT) {
      tablesHeight = height;
    }
  }
});

// Persist state when it changes
$effect(() => {
  localStorage.setItem("csvstudio:panelWidth", String(panelWidth));
});

$effect(() => {
  localStorage.setItem("csvstudio:panelCollapsed", String(isCollapsed));
});

$effect(() => {
  localStorage.setItem("csvstudio:tablesHeight", String(tablesHeight));
});

function startResize(e: MouseEvent) {
  e.preventDefault();
  isResizing = true;

  const startX = e.clientX;
  const startWidth = panelWidth;

  function onMove(e: MouseEvent) {
    const delta = e.clientX - startX;
    const newWidth = startWidth + delta;
    panelWidth = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, newWidth));
  }

  function onUp() {
    isResizing = false;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  }

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

function startResizeTables(e: MouseEvent) {
  e.preventDefault();
  isResizingTables = true;

  const startY = e.clientY;
  const startHeight = tablesHeight;

  function onMove(e: MouseEvent) {
    const delta = startY - e.clientY;
    const newHeight = startHeight + delta;
    tablesHeight = Math.max(MIN_TABLES_HEIGHT, newHeight);
  }

  function onUp() {
    isResizingTables = false;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  }

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

function toggleCollapse() {
  isCollapsed = !isCollapsed;
}

async function startRename(tab: WorkspaceTab) {
  editingTabId = tab.id;
  renameValue = tab.name;
  await tick();
  renameInput?.focus();
  renameInput?.select();
}

function finishRename() {
  if (!editingTabId) return;
  const name = renameValue.trim();
  if (name) {
    ontabrename?.(editingTabId, name);
  }
  editingTabId = null;
}

function cancelRename() {
  editingTabId = null;
}

function handleRenameKeydown(event: KeyboardEvent) {
  if (event.key === "Enter") {
    event.preventDefault();
    finishRename();
  } else if (event.key === "Escape") {
    event.preventDefault();
    cancelRename();
  }
}

function resetDropState() {
  pageDragDepth = 0;
  isDropActive = false;
}

function showFeedback(message: string) {
  feedbackMessage = message;
  if (feedbackTimer) {
    clearTimeout(feedbackTimer);
  }
  feedbackTimer = setTimeout(() => {
    feedbackMessage = null;
    feedbackTimer = null;
  }, 4500);
}

function processDroppedFiles(files: File[]) {
  const { supportedFiles, skippedCount } = partitionSupportedDataFiles(files);

  if (supportedFiles.length === 0) {
    showFeedback("Please select CSV, TSV, Parquet, JSON, or JSONL files.");
    return;
  }

  if (skippedCount > 0) {
    showFeedback(
      `Loaded ${supportedFiles.length} of ${files.length} files. Some files were skipped.`,
    );
  }

  void onfileselectmultiple?.(supportedFiles);
}

function handleWindowDragEnter(event: DragEvent) {
  if (!isFileDragEvent(event)) return;

  event.preventDefault();
  pageDragDepth += 1;
  isDropActive = true;
}

function handleWindowDragOver(event: DragEvent) {
  if (!isFileDragEvent(event)) return;

  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "copy";
  }
  isDropActive = true;
}

function handleWindowDragLeave(event: DragEvent) {
  if (!isDropActive || !isFileDragEvent(event)) return;

  event.preventDefault();
  pageDragDepth = Math.max(pageDragDepth - 1, 0);
  if (pageDragDepth === 0) {
    isDropActive = false;
  }
}

function handleWindowDrop(event: DragEvent) {
  if (!isFileDragEvent(event)) return;

  event.preventDefault();
  const { dataTransfer } = event;
  const droppedFiles = Array.from(dataTransfer?.files ?? []);
  resetDropState();

  if (droppedFiles.length === 0) return;
  void storeDroppedFileHandles(dataTransfer);
  processDroppedFiles(droppedFiles);
}

onDestroy(() => {
  if (feedbackTimer) {
    clearTimeout(feedbackTimer);
  }
});
</script>

<svelte:window
    ondragenter={handleWindowDragEnter}
    ondragover={handleWindowDragOver}
    ondragleave={handleWindowDragLeave}
    ondrop={handleWindowDrop}
/>

<div class="flex-1 flex overflow-hidden">
    {#if !isCollapsed}
        <div
            class="flex-none border-r border-slate-700 flex flex-col bg-slate-900 relative"
            style="width: {panelWidth}px"
        >
            <div class="flex-1 overflow-hidden flex flex-col min-h-0">
                <SQLEditor
                    onexecute={onquery}
                    onchange={onquerychange}
                    {tables}
                    {query}
                    isLoading={isQuerying}
                    oncollapse={toggleCollapse}
                />
            </div>

            {#if tabs.length > 0}
                <button
                    type="button"
                    class="h-1 cursor-ns-resize hover:bg-emerald-500/50 transition-colors {isResizingTables
                        ? 'bg-emerald-500/50'
                        : ''}"
                    onmousedown={startResizeTables}
                    aria-label="Resize tables section"
                ></button>

                <div
                    class="flex-none border-t border-slate-700 bg-slate-800/30 flex flex-col overflow-hidden"
                    style="height: {tablesHeight}px"
                >
                    <div class="flex min-h-0 flex-1 flex-col px-2 py-2">
                        <h3 class="mb-1.5 px-1 text-xs font-medium text-slate-400">
                            {tabs.length}
                            {tabs.length === 1 ? "tab" : "tabs"} open
                        </h3>
                        <div class="min-h-0 flex-1 space-y-1 overflow-y-auto">
                            {#each tabs as tab (tab.id)}
                                {@const isActive = tab.id === activeTabId}
                                <div
                                    class="group flex h-9 items-stretch rounded border transition-colors {isActive
                                        ? 'border-emerald-500 bg-emerald-500/10'
                                        : 'border-slate-700 bg-slate-900 hover:border-slate-600 hover:bg-slate-800/70'}"
                                >
                                    {#if editingTabId === tab.id}
                                        <input
                                            bind:this={renameInput}
                                            bind:value={renameValue}
                                            class="m-1 min-w-0 flex-1 rounded border border-emerald-500/70 bg-slate-950 px-1.5 text-xs text-slate-100 outline-none"
                                            aria-label={`Rename ${tab.name}`}
                                            onblur={finishRename}
                                            onkeydown={handleRenameKeydown}
                                        />
                                    {:else}
                                        <button
                                            type="button"
                                            class="min-w-0 flex-1 rounded-l px-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/60"
                                            onclick={(event) => {
                                                if (event.detail < 2) {
                                                    ontabclick?.(tab.id);
                                                }
                                            }}
                                            ondblclick={() => startRename(tab)}
                                            onkeydown={(event) => {
                                                if (event.key === "F2") {
                                                    event.preventDefault();
                                                    void startRename(tab);
                                                }
                                            }}
                                            title={`${tab.fileName ?? tab.sql} · Double-click or press F2 to rename`}
                                            aria-label={`View ${tab.name}`}
                                            aria-pressed={isActive}
                                        >
                                            <div
                                                class="flex min-w-0 items-baseline gap-2"
                                            >
                                                <span
                                                    class="min-w-0 flex-1 truncate text-xs font-medium {isActive
                                                        ? 'text-emerald-200'
                                                        : 'text-slate-200'}"
                                                >{tab.name}</span>
                                                <span
                                                    class="flex-none text-[10px] {tab.type ===
                                                    'RESULT'
                                                        ? 'text-violet-400'
                                                        : 'text-slate-500'}"
                                                >{tab.type}</span>
                                            </div>
                                        </button>
                                    {/if}
                                    <button
                                        type="button"
                                        class="m-1 ml-0 flex w-7 items-center justify-center rounded text-slate-500 transition-colors hover:bg-slate-700 hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60"
                                        aria-label={`Close ${tab.name}`}
                                        title={`Close ${tab.name}`}
                                        onclick={() => ontabclose?.(tab.id)}
                                    >
                                        <Icon name="x" class="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            {/each}
                        </div>

                        <div class="mt-2 border-t border-slate-700 pt-2">
                            <FileUpload compact={true} {onfileselectmultiple} />
                        </div>
                    </div>
                </div>
            {/if}

            <!-- Horizontal resize handle -->
            <button
                type="button"
                class="absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-emerald-500/50 transition-colors {isResizing
                    ? 'bg-emerald-500/50'
                    : ''}"
                onmousedown={startResize}
                aria-label="Resize panel"
            ></button>
        </div>
    {:else}
        <!-- Collapsed state - show expand button -->
        <div
            class="flex-none border-r border-slate-700 bg-slate-900 flex flex-col items-center p-2"
        >
            <button
                type="button"
                onclick={toggleCollapse}
                class="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800/90 text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
                title="Show panel"
                aria-label="Show panel"
            >
                <Icon name="panel" class="w-5 h-5" />
            </button>

            {#if tabs.length > 0}
                <div
                    class="mt-2 w-8 h-8 flex items-center justify-center rounded bg-slate-800 text-s font-light text-slate-400"
                    title={`${tabs.length} tabs open`}
                >
                    {tabs.length}
                </div>
            {/if}
        </div>
    {/if}

    <div class="flex-1 flex flex-col overflow-hidden bg-slate-900">
        <div
            class="flex-none bg-slate-800/30 border-b border-slate-700 px-4 py-2.5"
        >
            <div class="flex items-center gap-3">
                <SearchInput
                    value={searchValue}
                    placeholder="Search all columns..."
                    mode="enter"
                    {onsearch}
                />
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
            </div>
        </div>

        <div class="flex-1 overflow-hidden">
            <DataTable
                {columns}
                {rows}
                {totalRows}
                isLoading={isQuerying}
                {onsort}
                {onfilter}
            />
        </div>
    </div>
</div>

{#if isDropActive}
    <div
        class="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm"
    >
        <div
            class="w-full max-w-xl rounded-2xl border-2 border-dashed border-emerald-400 bg-slate-900/90 px-8 py-7 text-center shadow-2xl"
        >
            <p class="text-2xl font-semibold text-emerald-300">
                Drop anywhere to add files
            </p>
            <p class="mt-2 text-sm text-slate-300">
                Supported formats: {SUPPORTED_DATA_FILE_EXTENSIONS.join(", ")}
            </p>
        </div>
    </div>
{/if}

{#if feedbackMessage}
    <div
        class="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-slate-600 bg-slate-900/95 px-4 py-2 text-sm text-slate-200 shadow-lg"
    >
        {feedbackMessage}
    </div>
{/if}
