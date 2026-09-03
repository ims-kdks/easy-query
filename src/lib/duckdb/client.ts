import { get, writable } from "svelte/store";
import { removeFileHandleByName } from "$lib/fileHandleStore";
import { escapeIdentifier } from "./queries";

// DuckDB is imported dynamically to avoid SSR issues (browser-only library)
type DuckDB = typeof import("@duckdb/duckdb-wasm");
let duckdb: DuckDB | null = null;

async function getDuckDB(): Promise<DuckDB> {
  if (!duckdb) {
    duckdb = await import("@duckdb/duckdb-wasm");
  }
  return duckdb;
}

// Types
export interface ColumnInfo {
  name: string;
  type: string;
}

export interface TableInfo {
  name: string;
  fileName: string;
  columns: ColumnInfo[];
  rowCount: number;
}

export interface CatalogTableInfo {
  catalog: string;
  schema: string;
  name: string;
  type: string;
  sourceFile: string | null;
  rowCount: number | null;
  columns: Array<ColumnInfo & { nullable: boolean }>;
}

export interface WebMCPQueryResult {
  ok: boolean;
  sql: string;
  statementType: string;
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionMs: number | null;
  catalogChanged: boolean;
  error: string | null;
}

export type ExportFormat = "csv" | "tsv" | "parquet";

export interface DatabaseState {
  isInitialized: boolean;
  isLoading: boolean;
  isQuerying: boolean;
  tables: TableInfo[];
  columns: ColumnInfo[]; // Current query result columns
  rows: Record<string, unknown>[];
  totalRows: number;
  queryTime: number | null;
  error: string | null;
  lastQuery: string | null;
}

// Initial state
const initialState: DatabaseState = {
  isInitialized: false,
  isLoading: false,
  isQuerying: false,
  tables: [],
  columns: [],
  rows: [],
  totalRows: 0,
  queryTime: null,
  error: null,
  lastQuery: null,
};

// Store
export const databaseState = writable<DatabaseState>(initialState);

// DuckDB instances (typed loosely to avoid importing types at top level)
// biome-ignore lint/suspicious/noExplicitAny: DuckDB types not available at top level
let db: any = null;
// biome-ignore lint/suspicious/noExplicitAny: DuckDB types not available at top level
let conn: any = null;

// Constants for virtual scrolling
const PAGE_SIZE = 500;
let currentOffset = 0;
let baseQuery = "SELECT * FROM data";

/**
 * Initialize DuckDB-Wasm
 */
export async function initDatabase(): Promise<void> {
  if (db) return;

  let workerUrl: string | null = null;

  try {
    databaseState.update((s) => ({ ...s, isLoading: true, error: null }));

    // Dynamically import DuckDB (browser-only)
    const duckdbModule = await getDuckDB();

    // Select the best bundle for this browser
    const JSDELIVR_BUNDLES = duckdbModule.getJsDelivrBundles();
    const bundle = await duckdbModule.selectBundle(JSDELIVR_BUNDLES);

    workerUrl = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker}");`], {
        type: "text/javascript",
      }),
    );

    const worker = new Worker(workerUrl);
    // Suppress verbose DuckDB console logs (only surface errors)
    const logger = new duckdbModule.ConsoleLogger(duckdbModule.LogLevel.ERROR);

    db = new duckdbModule.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

    conn = await db.connect();

    databaseState.update((s) => ({
      ...s,
      isInitialized: true,
      isLoading: false,
    }));

    if (import.meta.env.DEV) {
      console.info("DuckDB-Wasm initialized successfully");
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to initialize DuckDB";
    databaseState.update((s) => ({
      ...s,
      isLoading: false,
      error: message,
    }));
    console.error("DuckDB initialization error:", error);
  } finally {
    if (workerUrl) {
      URL.revokeObjectURL(workerUrl);
    }
  }
}

/**
 * Generate a safe table name from filename
 */
function getTableName(fileName: string): string {
  // Remove extension and sanitize
  const name = fileName.replace(/\.[^/.]+$/, "");
  // Replace invalid characters with underscore
  return name.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase() || "table";
}

function stripTrailingSemicolons(sql: string): string {
  return sql.trim().replace(/;+\s*$/, "");
}

function isReadableQuery(sql: string): boolean {
  return /^(SELECT|WITH)\b/i.test(sql);
}

function buildQueryWrapper(sql: string): string {
  return `SELECT * FROM (${sql}) AS "__csv_studio_result"`;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw (
      signal.reason ??
      new DOMException("Tool execution cancelled", "AbortError")
    );
  }
}

function serializeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) return Array.from(value);
  if (Array.isArray(value)) return value.map(serializeValue);

  if (typeof value === "object") {
    const record: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      record[key] = serializeValue(nestedValue);
    }
    return record;
  }

  return value;
}

export async function loadDataFile(file: File): Promise<string | null> {
  if (!db || !conn) {
    await initDatabase();
  }

  if (!db || !conn) {
    databaseState.update((s) => ({ ...s, error: "Database not initialized" }));
    return null;
  }

  try {
    databaseState.update((s) => ({
      ...s,
      isLoading: true,
      error: null,
    }));

    const duckdbModule = await getDuckDB();
    const tableName = getTableName(file.name);
    const quotedTableName = `"${escapeIdentifier(tableName)}"`;
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "csv";
    const fileHandle = `file_${Date.now()}_${tableName}.${extension}`;

    // Register the file with DuckDB
    await db.registerFileHandle(
      fileHandle,
      file,
      duckdbModule.DuckDBDataProtocol.BROWSER_FILEREADER,
      true,
    );

    // Drop existing table if any (allow overwriting)
    await conn.query(`DROP TABLE IF EXISTS ${quotedTableName}`);

    if (extension === "parquet") {
      await conn.query(`
                CREATE TABLE ${quotedTableName} AS
                SELECT * FROM read_parquet('${fileHandle}')
            `);
    } else if (extension === "json" || extension === "json5") {
      await conn.query(`
                CREATE TABLE ${quotedTableName} AS
                SELECT * FROM read_json_auto('${fileHandle}')
            `);
    } else if (extension === "jsonl" || extension === "ndjson") {
      await conn.query(`
                CREATE TABLE ${quotedTableName} AS
                SELECT * FROM read_ndjson_auto('${fileHandle}')
            `);
    } else {
      // DuckDB doesn't support blacklisting types; whitelist numerics/bool and leave temporal as text
      // Do not use smaller types, they could cause some strange bugs
      await conn.query(`
                CREATE TABLE ${quotedTableName} AS
                SELECT * FROM read_csv(
                    '${fileHandle}',
                    header = true,
                    auto_detect = true,
                    sample_size = 20000,
                    auto_type_candidates = [
                        BOOLEAN,
                        BIGINT,
                        DOUBLE,
                        VARCHAR
                    ]
                )
            `);
    }

    // Get schema
    const schemaResult = await conn.query(`
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = '${tableName}'
            ORDER BY ordinal_position
        `);

    const columns: ColumnInfo[] = [];
    for (let i = 0; i < schemaResult.numRows; i++) {
      columns.push({
        name: String(schemaResult.getChildAt(0)?.get(i) ?? ""),
        type: String(schemaResult.getChildAt(1)?.get(i) ?? ""),
      });
    }

    // Get total row count
    const countResult = await conn.query(
      `SELECT COUNT(*) as cnt FROM ${quotedTableName}`,
    );
    const rowCount = Number(countResult.getChildAt(0)?.get(0) ?? 0);

    // Update tables list
    databaseState.update((s) => {
      const existingIndex = s.tables.findIndex((t) => t.name === tableName);
      const tableInfo: TableInfo = {
        name: tableName,
        fileName: file.name,
        columns,
        rowCount,
      };

      const newTables =
        existingIndex >= 0
          ? s.tables.map((t, i) => (i === existingIndex ? tableInfo : t))
          : [...s.tables, tableInfo];

      return {
        ...s,
        isLoading: false,
        tables: newTables,
      };
    });

    await executeQuery(`SELECT * FROM "${escapeIdentifier(tableName)}"`);

    if (import.meta.env.DEV) {
      console.info(
        `Loaded file: ${file.name} as table "${tableName}", ${rowCount} rows, ${columns.length} columns`,
      );
    }
    return tableName;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load file";
    databaseState.update((s) => ({
      ...s,
      isLoading: false,
      error: message,
    }));
    console.error("File load error:", error);
    return null;
  }
}

/**
 * Read the live DuckDB catalog for WebMCP agents.
 */
export async function listCatalogTables(
  signal?: AbortSignal,
): Promise<CatalogTableInfo[]> {
  if (!db || !conn) {
    await initDatabase();
  }

  if (!conn) {
    throw new Error("Database not initialized");
  }

  throwIfAborted(signal);

  const tablesResult = await conn.query(`
    SELECT table_catalog, table_schema, table_name, table_type
    FROM information_schema.tables
    WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
    ORDER BY table_catalog, table_schema, table_name
  `);
  const columnsResult = await conn.query(`
    SELECT table_catalog, table_schema, table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
    ORDER BY table_catalog, table_schema, table_name, ordinal_position
  `);

  const columnsByTable = new Map<
    string,
    Array<ColumnInfo & { nullable: boolean }>
  >();

  for (let index = 0; index < columnsResult.numRows; index++) {
    const catalog = String(columnsResult.getChildAt(0)?.get(index) ?? "");
    const schema = String(columnsResult.getChildAt(1)?.get(index) ?? "");
    const name = String(columnsResult.getChildAt(2)?.get(index) ?? "");
    const key = `${catalog}\u0000${schema}\u0000${name}`;
    const columns = columnsByTable.get(key) ?? [];
    columns.push({
      name: String(columnsResult.getChildAt(3)?.get(index) ?? ""),
      type: String(columnsResult.getChildAt(4)?.get(index) ?? ""),
      nullable:
        String(columnsResult.getChildAt(5)?.get(index) ?? "YES") === "YES",
    });
    columnsByTable.set(key, columns);
  }

  const loadedTables = get(databaseState).tables;
  const tables: CatalogTableInfo[] = [];

  for (let index = 0; index < tablesResult.numRows; index++) {
    throwIfAborted(signal);

    const catalog = String(tablesResult.getChildAt(0)?.get(index) ?? "");
    const schema = String(tablesResult.getChildAt(1)?.get(index) ?? "");
    const name = String(tablesResult.getChildAt(2)?.get(index) ?? "");
    const type = String(tablesResult.getChildAt(3)?.get(index) ?? "");
    const key = `${catalog}\u0000${schema}\u0000${name}`;
    let rowCount: number | null = null;

    try {
      const qualifiedName = `"${escapeIdentifier(catalog)}"."${escapeIdentifier(schema)}"."${escapeIdentifier(name)}"`;
      const countResult = await conn.query(
        `SELECT COUNT(*) AS count FROM ${qualifiedName}`,
      );
      rowCount = Number(countResult.getChildAt(0)?.get(0) ?? 0);
    } catch {
      // Some catalog objects cannot be counted without arguments or permissions.
    }

    tables.push({
      catalog,
      schema,
      name,
      type,
      sourceFile:
        schema === "main"
          ? (loadedTables.find((table) => table.name === name)?.fileName ??
            null)
          : null,
      rowCount,
      columns: columnsByTable.get(key) ?? [],
    });
  }

  return tables;
}

export function reconcileLoadedTables(catalogTables: CatalogTableInfo[]) {
  const mainTables = new Map(
    catalogTables
      .filter((table) => table.schema === "main")
      .map((table) => [table.name, table]),
  );

  databaseState.update((state) => ({
    ...state,
    tables: state.tables
      .filter((table) => mainTables.has(table.name))
      .map((table) => {
        const catalogTable = mainTables.get(table.name);
        if (!catalogTable) return table;
        return {
          ...table,
          columns: catalogTable.columns.map(({ name, type }) => ({
            name,
            type,
          })),
          rowCount: catalogTable.rowCount ?? table.rowCount,
        };
      }),
  }));
}

/**
 * Execute SQL for WebMCP and return the complete result while keeping the UI in sync.
 */
export async function executeWebMCPQuery(
  sql: string,
  signal?: AbortSignal,
): Promise<WebMCPQueryResult> {
  if (!db || !conn) {
    await initDatabase();
  }

  const cleanSql = stripTrailingSemicolons(sql);
  const statementType =
    cleanSql.match(/^\s*([a-z]+)/i)?.[1]?.toUpperCase() ?? "UNKNOWN";
  const catalogChanged = /\b(CREATE|DROP|ALTER|ATTACH|DETACH)\b/i.test(
    cleanSql,
  );

  if (!conn) {
    return {
      ok: false,
      sql: cleanSql,
      statementType,
      columns: [],
      rows: [],
      rowCount: 0,
      executionMs: null,
      catalogChanged,
      error: "Database not initialized",
    };
  }

  if (!cleanSql) {
    return {
      ok: false,
      sql: cleanSql,
      statementType,
      columns: [],
      rows: [],
      rowCount: 0,
      executionMs: null,
      catalogChanged,
      error: "Query is empty",
    };
  }

  try {
    throwIfAborted(signal);
    databaseState.update((state) => ({
      ...state,
      isQuerying: true,
      error: null,
    }));

    const startTime = performance.now();
    const result = await conn.query(cleanSql);
    throwIfAborted(signal);

    const columns: ColumnInfo[] = [];
    for (let index = 0; index < result.numCols; index++) {
      const field = result.schema.fields[index];
      columns.push({ name: field.name, type: field.type.toString() });
    }

    const uiRows: Record<string, unknown>[] = [];
    const rows: Record<string, unknown>[] = [];
    for (let rowIndex = 0; rowIndex < result.numRows; rowIndex++) {
      const uiRow: Record<string, unknown> = {};
      const serializedRow: Record<string, unknown> = {};

      for (let columnIndex = 0; columnIndex < result.numCols; columnIndex++) {
        const field = result.schema.fields[columnIndex];
        const value = result.getChildAt(columnIndex)?.get(rowIndex);
        uiRow[field.name] = value;
        serializedRow[field.name] = serializeValue(value);
      }

      if (rowIndex < PAGE_SIZE) {
        uiRows.push(uiRow);
      }
      rows.push(serializedRow);
    }

    const executionMs = performance.now() - startTime;
    currentOffset = 0;
    if (isReadableQuery(cleanSql)) {
      baseQuery = cleanSql;
    }

    databaseState.update((state) => ({
      ...state,
      isQuerying: false,
      columns,
      rows: uiRows,
      totalRows: rows.length,
      queryTime: executionMs,
      lastQuery: cleanSql,
    }));

    return {
      ok: true,
      sql: cleanSql,
      statementType,
      columns,
      rows,
      rowCount: rows.length,
      executionMs,
      catalogChanged,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query failed";
    databaseState.update((state) => ({
      ...state,
      isQuerying: false,
      error: message,
    }));

    return {
      ok: false,
      sql: cleanSql,
      statementType,
      columns: [],
      rows: [],
      rowCount: 0,
      executionMs: null,
      catalogChanged,
      error: message,
    };
  }
}

/**
 * Drop a table and remove it from state
 */
export async function dropTable(tableName: string): Promise<boolean> {
  if (!conn) {
    databaseState.update((s) => ({ ...s, error: "Database not connected" }));
    return false;
  }

  try {
    databaseState.update((s) => ({ ...s, isLoading: true, error: null }));
    await conn.query(`DROP TABLE IF EXISTS "${escapeIdentifier(tableName)}"`);

    const prevState = get(databaseState);
    const droppedTable = prevState.tables.find((t) => t.name === tableName);
    const newTables = prevState.tables.filter((t) => t.name !== tableName);

    // Remove stored file handle for this table
    if (droppedTable) {
      removeFileHandleByName(droppedTable.fileName).catch((err) => {
        console.warn("Failed to remove stored file handle:", err);
      });
    }

    databaseState.update((s) => {
      const nextState = {
        ...s,
        isLoading: false,
        tables: newTables,
      };

      if (newTables.length === 0) {
        return {
          ...nextState,
          columns: [],
          rows: [],
          totalRows: 0,
          queryTime: null,
          lastQuery: null,
        };
      }

      return nextState;
    });

    if (newTables.length > 0 && prevState.lastQuery) {
      const tablePattern = new RegExp(`\\b${tableName}\\b`, "i");
      if (
        prevState.lastQuery.includes(`"${tableName}"`) ||
        tablePattern.test(prevState.lastQuery)
      ) {
        await executeQuery(
          `SELECT * FROM "${escapeIdentifier(newTables[0].name)}"`,
        );
      }
    }
    return true;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to drop table";
    databaseState.update((s) => ({
      ...s,
      isLoading: false,
      error: message,
    }));
    console.error("Drop table error:", error);
    return false;
  }
}

/**
 * Export the current query result to a file.
 */
export async function exportQueryResult(
  format: ExportFormat,
  query?: string,
): Promise<string> {
  if (!db || !conn) {
    await initDatabase();
  }

  if (!db || !conn) {
    const message = "Database not initialized";
    databaseState.update((s) => ({ ...s, error: message }));
    throw new Error(message);
  }

  const state = get(databaseState);
  let resolvedQuery = query?.trim() || state.lastQuery?.trim() || "";
  if (!resolvedQuery) {
    const fallbackTable = state.tables[0];
    if (fallbackTable) {
      resolvedQuery = `SELECT * FROM "${escapeIdentifier(fallbackTable.name)}"`;
    }
  }

  if (!resolvedQuery) {
    const message = "No query available to export";
    databaseState.update((s) => ({ ...s, error: message }));
    throw new Error(message);
  }

  const cleanQuery = resolvedQuery.replace(/;+\s*$/, "");
  const extension = format === "parquet" ? "parquet" : format;
  const now = Date.now();
  const outputFileName = `query_result_${now}.${extension}`;
  let tempFile: string | null = null;

  try {
    tempFile = `export_${now}.${extension}`;
    let copySql = "";

    if (format === "csv") {
      copySql = `COPY (${cleanQuery}) TO '${tempFile}' (FORMAT CSV, HEADER true, DELIM ',')`;
    } else if (format === "tsv") {
      copySql = `COPY (${cleanQuery}) TO '${tempFile}' (FORMAT CSV, HEADER true, DELIM '\\t')`;
    } else {
      copySql = `COPY (${cleanQuery}) TO '${tempFile}' (FORMAT PARQUET)`;
    }

    await conn.query(copySql);

    const buffer = await db.copyFileToBuffer(tempFile);
    const mimeType =
      format === "parquet"
        ? "application/vnd.apache.parquet"
        : format === "tsv"
          ? "text/tab-separated-values"
          : "text/csv";

    const data = Uint8Array.from(buffer);
    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = outputFileName;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    return outputFileName;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to export data";
    databaseState.update((s) => ({ ...s, error: message }));
    throw new Error(message);
  } finally {
    if (db && tempFile) {
      try {
        await db.dropFile(tempFile);
      } catch {
        // Best-effort cleanup.
      }
    }
  }
}

/**
 * Fetch rows with pagination
 */
async function fetchRows(
  query: string,
  offset: number,
  limit: number,
): Promise<Record<string, unknown>[]> {
  if (!conn) return [];

  const paginatedQuery = `${buildQueryWrapper(query)} LIMIT ${limit} OFFSET ${offset}`;

  const result = await conn.query(paginatedQuery);
  const rows: Record<string, unknown>[] = [];

  const numRows = result.numRows;
  const numCols = result.numCols;

  for (let i = 0; i < numRows; i++) {
    const row: Record<string, unknown> = {};
    for (let j = 0; j < numCols; j++) {
      const field = result.schema.fields[j];
      const column = result.getChildAt(j);
      row[field.name] = column?.get(i);
    }
    rows.push(row);
  }

  return rows;
}

/**
 * Execute a SQL query
 */
export async function executeQuery(sql: string): Promise<void> {
  if (!conn) {
    databaseState.update((s) => ({ ...s, error: "Database not connected" }));
    return;
  }

  const cleanSql = stripTrailingSemicolons(sql);
  if (!cleanSql) {
    databaseState.update((s) => ({
      ...s,
      error: "Query is empty",
      isQuerying: false,
    }));
    return;
  }

  try {
    databaseState.update((s) => ({
      ...s,
      isQuerying: true,
      error: null,
    }));

    const startTime = performance.now();

    // Reset pagination for new query
    currentOffset = 0;
    baseQuery = cleanSql;

    if (!isReadableQuery(cleanSql)) {
      // For non-SELECT queries, just execute and return
      await conn.query(cleanSql);
      const endTime = performance.now();
      databaseState.update((s) => ({
        ...s,
        isQuerying: false,
        queryTime: endTime - startTime,
        lastQuery: cleanSql,
      }));
      return;
    }

    const countQuery = `SELECT COUNT(*) as cnt FROM (${cleanSql}) AS "__csv_studio_count"`;
    const countResult = await conn.query(countQuery);
    const totalRows = Number(countResult.getChildAt(0)?.get(0) ?? 0);

    // Fetch first page
    const rows = await fetchRows(cleanSql, 0, PAGE_SIZE);

    // Extract columns from result schema
    const tempResult = await conn.query(
      `${buildQueryWrapper(cleanSql)} LIMIT 0`,
    );
    const resultColumns: ColumnInfo[] = [];
    for (let i = 0; i < tempResult.numCols; i++) {
      const field = tempResult.schema.fields[i];
      resultColumns.push({
        name: field.name,
        type: field.type.toString(),
      });
    }

    const endTime = performance.now();

    databaseState.update((s) => ({
      ...s,
      isQuerying: false,
      columns: resultColumns,
      rows,
      totalRows,
      queryTime: endTime - startTime,
      lastQuery: cleanSql,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query failed";
    databaseState.update((s) => ({
      ...s,
      isQuerying: false,
      error: message,
    }));
    console.error("Query error:", error);
  }
}

/**
 * Load more rows for infinite scrolling
 */
export async function loadMoreRows(): Promise<void> {
  if (!conn) return;

  const state = get(databaseState);
  if (state.rows.length >= state.totalRows) return; // All rows loaded
  if (state.isQuerying) return; // Already loading

  try {
    databaseState.update((s) => ({ ...s, isQuerying: true }));

    currentOffset += PAGE_SIZE;
    const newRows = await fetchRows(baseQuery, currentOffset, PAGE_SIZE);

    databaseState.update((s) => ({
      ...s,
      isQuerying: false,
      rows: [...s.rows, ...newRows],
    }));
  } catch (error) {
    console.error("Load more error:", error);
    databaseState.update((s) => ({ ...s, isQuerying: false }));
  }
}

/**
 * Restore files from stored file handles (auto-restore on page load).
 * Only restores files that already have granted permission.
 * Returns the number of files successfully restored.
 */
export async function restoreFromStoredHandles(): Promise<number> {
  const {
    isFileSystemAccessSupported,
    getStoredFileHandles,
    getFileFromHandleIfGranted,
    removeFileHandle,
  } = await import("$lib/fileHandleStore");

  if (!isFileSystemAccessSupported()) {
    return 0;
  }

  const storedHandles = await getStoredFileHandles();
  if (storedHandles.length === 0) {
    return 0;
  }

  let restoredCount = 0;

  for (const entry of storedHandles) {
    try {
      // Only restore if permission is already granted (no user gesture available)
      const file = await getFileFromHandleIfGranted(entry.handle);
      if (file) {
        await loadDataFile(file);
        restoredCount++;
      }
      // If permission not granted, keep the handle for manual restore later
    } catch (error) {
      console.warn(`Failed to restore file ${entry.fileName}:`, error);
      // Remove invalid/corrupted handles
      await removeFileHandle(entry.id);
    }
  }

  return restoredCount;
}

/**
 * Get the number of pending files that need permission re-granting.
 */
export async function getPendingRestoreCount(): Promise<number> {
  const { isFileSystemAccessSupported, getPendingFileHandles } = await import(
    "$lib/fileHandleStore"
  );

  if (!isFileSystemAccessSupported()) {
    return 0;
  }

  const pending = await getPendingFileHandles();
  return pending.length;
}

/**
 * Restore files that need permission re-granting.
 * MUST be called from a user gesture (click handler).
 * Returns the number of files successfully restored.
 */
export async function restorePendingFiles(): Promise<number> {
  const {
    isFileSystemAccessSupported,
    getPendingFileHandles,
    getFileFromHandleWithPermission,
    removeFileHandle,
  } = await import("$lib/fileHandleStore");

  if (!isFileSystemAccessSupported()) {
    return 0;
  }

  const pendingHandles = await getPendingFileHandles();
  if (pendingHandles.length === 0) {
    return 0;
  }

  let restoredCount = 0;

  for (const entry of pendingHandles) {
    try {
      // Request permission (requires user gesture)
      const file = await getFileFromHandleWithPermission(entry.handle);
      if (file) {
        await loadDataFile(file);
        restoredCount++;
      } else {
        // User denied permission, remove the handle
        await removeFileHandle(entry.id);
      }
    } catch (error) {
      console.warn(`Failed to restore file ${entry.fileName}:`, error);
      await removeFileHandle(entry.id);
    }
  }

  return restoredCount;
}
