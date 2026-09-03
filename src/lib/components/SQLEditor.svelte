<script lang="ts">
import type { Completion } from "@codemirror/autocomplete";
import { type SQLConfig, type SQLNamespace, sql } from "@codemirror/lang-sql";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { basicSetup, EditorView } from "codemirror";
import { onMount } from "svelte";
import type { TableInfo } from "$lib/duckdb/client";
import Icon from "./Icon.svelte";

interface Props {
  tables: TableInfo[];
  query: string;
  isLoading?: boolean;
  onexecute?: (query: string) => void;
  onchange?: (query: string) => void;
  oncollapse?: () => void;
}

let {
  tables,
  query,
  isLoading = false,
  onexecute,
  onchange,
  oncollapse,
}: Props = $props();

let editorContainer: HTMLDivElement;
let editor = $state<EditorView | null>(null);
let showTooltip = $state(false);
const sqlConfigCompartment = new Compartment();
let sqlConfig = $derived(() => buildSqlConfig(tables));

function executeQuery() {
  if (!editor || isLoading) return;
  const query = editor.state.doc.toString().trim();
  if (query) {
    onexecute?.(query);
  }
}

function buildSqlConfig(sourceTables: TableInfo[]): SQLConfig {
  const schema: Record<string, SQLNamespace> = {};

  for (const table of sourceTables) {
    const tableCompletion: Completion = {
      label: table.name,
      type: "table",
      detail: "table",
    };
    const columns: Completion[] = [];

    for (const column of table.columns) {
      const columnCompletion: Completion = {
        label: column.name,
        type: "column",
        detail: table.name,
      };

      columns.push(columnCompletion);

      if (!schema[column.name]) {
        schema[column.name] = {
          self: columnCompletion,
          children: [],
        };
      }
    }

    schema[table.name] = {
      self: tableCompletion,
      children: columns,
    };
  }

  return { schema };
}

// Create a dark theme
const darkTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    color: "#e2e8f0",
  },
  ".cm-content": {
    caretColor: "#10b981",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "13px",
  },
  ".cm-cursor": {
    borderLeftColor: "#10b981",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "#10b98133",
  },
  ".cm-activeLine": {
    backgroundColor: "#1e293b50",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "#475569",
    border: "none",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "#94a3b8",
  },
  ".cm-line": {
    padding: "0 4px",
  },
});

onMount(() => {
  // Keyboard shortcut to execute - use Prec.highest for top priority
  const executeKeymap = Prec.highest(
    keymap.of([
      {
        key: "Mod-Enter",
        run: () => {
          executeQuery();
          return true;
        },
      },
      {
        key: "Shift-Enter",
        run: () => {
          executeQuery();
          return true;
        },
      },
    ]),
  );

  editor = new EditorView({
    state: EditorState.create({
      doc: query,
      extensions: [
        executeKeymap, // Must be first with highest priority
        basicSetup,
        sqlConfigCompartment.of(sql(sqlConfig())),
        darkTheme,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onchange?.(update.state.doc.toString());
          }
        }),
      ],
    }),
    parent: editorContainer,
  });

  return () => {
    editor?.destroy();
  };
});

$effect(() => {
  if (!editor || editor.state.doc.toString() === query) return;

  editor.dispatch({
    changes: {
      from: 0,
      to: editor.state.doc.length,
      insert: query,
    },
  });
});

// Detect platform for keyboard shortcut display
const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPod|iPad/i.test(navigator.platform);
const modKey = isMac ? "Cmd" : "Ctrl";
const shortcutText = `${modKey} + Enter to run`;

$effect(() => {
  if (!editor) return;
  editor.dispatch({
    effects: sqlConfigCompartment.reconfigure(sql(sqlConfig())),
  });
});
</script>

<div class="h-full flex flex-col bg-slate-900">
    <div
        class="flex-none flex items-center justify-between p-2 bg-slate-800/50 border-b border-slate-700"
    >
        <div class="flex items-center gap-2">
            {#if oncollapse}
                <button
                    type="button"
                    onclick={oncollapse}
                    class="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800/90 text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
                    title="Collapse panel"
                    aria-label="Collapse panel"
                >
                    <Icon name="panel" class="w-5 h-5" />
                </button>
            {/if}
            <Icon name="code" class="w-4 h-4 text-emerald-500" />
            <span class="text-sm font-medium text-slate-300">SQL Query</span>
        </div>

        <div class="flex items-center gap-2">
            <!-- Execute button with tooltip -->
            <div class="relative">
                <button
                    type="button"
                    onclick={executeQuery}
                    disabled={isLoading}
                    onmouseenter={() => (showTooltip = true)}
                    onmouseleave={() => (showTooltip = false)}
                    onfocus={() => (showTooltip = true)}
                    onblur={() => (showTooltip = false)}
                    class="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg
                 transition-all duration-200
                 {isLoading
                        ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                        : 'bg-emerald-500 text-slate-900 hover:bg-emerald-400 active:scale-95'}"
                >
                    <span>Run</span>
                </button>
                {#if showTooltip && !isLoading}
                    <div
                        class="fixed mt-1 -translate-x-1/3 px-2 py-1 text-xs text-slate-200 bg-slate-800
                   border border-slate-600 rounded shadow-xl whitespace-nowrap pointer-events-none z-30"
                    >
                        {shortcutText}
                        <!-- Arrow -->
                        <div
                            class="absolute bottom-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4
                     border-transparent border-b-slate-600"
                        ></div>
                    </div>
                {/if}
            </div>
        </div>
    </div>

    <div bind:this={editorContainer} class="flex-1 overflow-auto px-1"></div>
</div>
