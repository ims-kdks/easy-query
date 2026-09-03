export interface TabRename {
  tabId: string;
  name: string;
}

export interface WebMCPHandlers {
  listTables: (signal: AbortSignal) => Promise<unknown>;
  listTabs: () => unknown;
  createQueryTab: (input: {
    name?: string;
    sql?: string;
    activate: boolean;
  }) => unknown;
  activateTab: (tabId: string) => Promise<unknown>;
  closeTabs: (tabIds: string[]) => Promise<unknown>;
  renameTabs: (renames: TabRename[]) => unknown;
  readQuery: (tabId: string) => unknown;
  writeQuery: (tabId: string, sql: string) => unknown;
  runQuery: (tabId: string, signal: AbortSignal) => Promise<unknown>;
}

function requiredString(
  input: Record<string, unknown>,
  property: string,
  allowEmpty = false,
): string {
  const value = input[property];
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) {
    throw new Error(
      `${property} must be a${allowEmpty ? "" : " non-empty"} string`,
    );
  }
  return value;
}

function optionalString(
  input: Record<string, unknown>,
  property: string,
): string | undefined {
  const value = input[property];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error(`${property} must be a string`);
  }
  return value;
}

function executeSafely(
  execute: WebMCP.ToolExecuteCallback,
): WebMCP.ToolExecuteCallback {
  return async (input, options) => {
    try {
      return await execute(input, options);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Tool execution failed",
      };
    }
  };
}

const helpContent = {
  files:
    "Use the upload area or drag and drop CSV, TSV, Parquet, JSON, or JSONL files. Processing stays in the browser. Local file selection requires the user.",
  tabs: "File and result tabs share the left sidebar. Click to activate, double-click or press F2 to rename, and use X to close. Closing a file tab unloads its DuckDB table.",
  sql: "Easy Query uses the DuckDB SQL dialect, including DuckDB syntax and built-in functions. Each tab stores its own SQL. Cmd/Ctrl+Enter or the Run button executes it. Custom SQL run from a file tab opens a RESULT tab.",
  table:
    "Scroll to load more rows. Click a row number for row details. Use column headers to sort and their controls to filter.",
  search:
    "Search filters the current query result across all visible columns. Sorting, filtering, and search can be combined.",
  export: "Export downloads the current query result as CSV, TSV, or Parquet.",
  privacy:
    "Files and DuckDB execution stay local. Data returned by a WebMCP tool is shared with the user's chosen browser agent.",
};

export async function registerWebMCPTools(
  handlers: WebMCPHandlers,
  signal: AbortSignal,
): Promise<boolean> {
  const modelContext = document.modelContext;
  if (!modelContext) return false;

  const tools: WebMCP.ModelContextTool[] = [
    {
      name: "list_tables",
      title: "List database tables",
      description:
        "List tables and views in the live DuckDB catalog with schemas, source files, and row counts. Use this before writing SQL.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: executeSafely((_input, { signal: executionSignal }) =>
        handlers.listTables(executionSignal),
      ),
    },
    {
      name: "list_tabs",
      title: "List workspace tabs",
      description:
        "List lightweight metadata for every open file and RESULT tab, including stable IDs and the active tab. Does not return SQL or result rows.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: executeSafely(() => handlers.listTabs()),
    },
    {
      name: "create_query_tab",
      title: "Create query tab",
      description:
        "Create a RESULT tab for drafting DuckDB SQL. This changes the workspace but does not execute the query.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Optional tab label." },
          sql: { type: "string", description: "Optional initial DuckDB SQL." },
          activate: {
            type: "boolean",
            description: "Whether to activate the new tab. Defaults to true.",
          },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: executeSafely((input) => {
        const activate = input.activate;
        if (activate !== undefined && typeof activate !== "boolean") {
          throw new Error("activate must be a boolean");
        }
        return handlers.createQueryTab({
          name: optionalString(input, "name"),
          sql: optionalString(input, "sql"),
          activate: activate ?? true,
        });
      }),
    },
    {
      name: "activate_tab",
      title: "Activate tab",
      description:
        "Make one existing tab active in the Easy Query interface. Read-only queries may be rerun to restore their result view.",
      inputSchema: {
        type: "object",
        properties: {
          tab_id: { type: "string", description: "Stable ID from list_tabs." },
        },
        required: ["tab_id"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: executeSafely((input) =>
        handlers.activateTab(requiredString(input, "tab_id")),
      ),
    },
    {
      name: "close_tabs",
      title: "Close tabs",
      description:
        "Close one or more tabs. Closing file tabs also unloads their in-memory DuckDB tables; original files are unchanged.",
      inputSchema: {
        type: "object",
        properties: {
          tab_ids: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            uniqueItems: true,
            description: "Stable tab IDs from list_tabs.",
          },
        },
        required: ["tab_ids"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: executeSafely((input) => {
        if (
          !Array.isArray(input.tab_ids) ||
          input.tab_ids.length === 0 ||
          !input.tab_ids.every((id) => typeof id === "string" && id.trim())
        ) {
          throw new Error("tab_ids must be a non-empty array of tab IDs");
        }
        return handlers.closeTabs([...new Set(input.tab_ids)]);
      }),
    },
    {
      name: "rename_tabs",
      title: "Rename tabs",
      description:
        "Rename one or more workspace tabs. Labels change, but DuckDB table names and SQL identifiers do not.",
      inputSchema: {
        type: "object",
        properties: {
          renames: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              properties: {
                tab_id: { type: "string" },
                name: { type: "string" },
              },
              required: ["tab_id", "name"],
              additionalProperties: false,
            },
          },
        },
        required: ["renames"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: executeSafely((input) => {
        if (!Array.isArray(input.renames) || input.renames.length === 0) {
          throw new Error("renames must be a non-empty array");
        }

        const renames = input.renames.map((rename) => {
          if (!rename || typeof rename !== "object" || Array.isArray(rename)) {
            throw new Error("Each rename must contain tab_id and name");
          }
          const record = rename as Record<string, unknown>;
          return {
            tabId: requiredString(record, "tab_id"),
            name: requiredString(record, "name"),
          };
        });
        return handlers.renameTabs(renames);
      }),
    },
    {
      name: "read_query",
      title: "Read tab query",
      description:
        "Read the exact SQL stored in any active or inactive workspace tab.",
      inputSchema: {
        type: "object",
        properties: {
          tab_id: { type: "string", description: "Stable ID from list_tabs." },
        },
        required: ["tab_id"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: executeSafely((input) =>
        handlers.readQuery(requiredString(input, "tab_id")),
      ),
    },
    {
      name: "write_query",
      title: "Write tab query",
      description:
        "Replace the DuckDB SQL stored in a workspace tab without executing it. Use this for drafts or before run_query.",
      inputSchema: {
        type: "object",
        properties: {
          tab_id: { type: "string", description: "Stable ID from list_tabs." },
          sql: {
            type: "string",
            description: "Complete DuckDB SQL editor contents.",
          },
        },
        required: ["tab_id", "sql"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: executeSafely((input) =>
        handlers.writeQuery(
          requiredString(input, "tab_id"),
          requiredString(input, "sql", true),
        ),
      ),
    },
    {
      name: "run_query",
      title: "Run tab query",
      description:
        "Execute the DuckDB SQL stored in one tab, update the visible workspace, and return the complete result or a structured DuckDB error.",
      inputSchema: {
        type: "object",
        properties: {
          tab_id: { type: "string", description: "Stable ID from list_tabs." },
        },
        required: ["tab_id"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: executeSafely((input, { signal: executionSignal }) =>
        handlers.runQuery(requiredString(input, "tab_id"), executionSignal),
      ),
    },
    {
      name: "get_help",
      title: "Get Easy Query help",
      description:
        "Return instructions about Easy Query files, tabs, SQL, table navigation, search, export, or privacy.",
      inputSchema: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            description: "Optional help topic or user question.",
          },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: executeSafely((input) => ({
        ok: true,
        requestedTopic: optionalString(input, "topic") ?? null,
        topics: helpContent,
      })),
    },
  ];

  await Promise.all(
    tools.map((tool) => modelContext.registerTool(tool, { signal })),
  );
  return true;
}
