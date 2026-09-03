# Easy Query WebMCP design

Easy Query exposes its local DuckDB workspace to browser agents through the
imperative WebMCP API. Agents can complete an analysis loop autonomously or
stop after writing SQL so the user can review and learn from the query.

All queries use the DuckDB SQL dialect. Agents should use DuckDB syntax and
built-in functions when drafting or executing SQL.

Local file selection remains a user action. Once files are loaded, agents can
inspect the database, manage tabs, write SQL, run it, inspect complete results,
and correct errors without additional human input.

## Tools

### `list_tables`

Reads the live DuckDB catalog. Returns tables and views with catalog and schema
names, object type, source filename when applicable, row count, and columns.

This is separate from `list_tabs`: database objects and UI tabs are not the
same thing, especially after `CREATE`, `DROP`, `ALTER`, `ATTACH`, or `DETACH`.

### `list_tabs`

Returns lightweight metadata for every open tab:

- stable ID
- display name
- file format or `RESULT` type
- active state
- associated table and source file, when applicable

It does not return SQL, schemas, or result rows.

### `create_query_tab`

Creates a `RESULT` tab for DuckDB SQL without executing it.

Inputs:

- `name` (optional)
- `sql` (optional)
- `activate` (optional, defaults to `true`)

### `activate_tab`

Activates one tab by stable ID. Read-only queries may be rerun to restore the
tab's result view. Non-read-only SQL is never rerun merely by activating a tab.

### `close_tabs`

Closes multiple tabs in one call.

Input: `tab_ids: string[]`

The result contains separate `closed` and `failed` arrays. Closing a file tab
unloads its in-memory DuckDB table but never modifies the original local file.

### `rename_tabs`

Renames multiple tabs in one call.

Input:

```json
{
  "renames": [
    { "tab_id": "result:1", "name": "Monthly trends" }
  ]
}
```

Renaming changes only the display label, not a DuckDB table name or SQL
identifier. The result contains separate `renamed` and `failed` arrays.

### `read_query`

Returns the exact SQL stored in one active or inactive tab.

Input: `tab_id: string`

### `write_query`

Replaces the DuckDB SQL stored in one tab without executing it.

Inputs:

- `tab_id: string`
- `sql: string`

Keeping this separate from `run_query` lets an agent act as a copilot: it can
prepare a query and leave execution to the user.

### `run_query`

Executes the DuckDB SQL stored in one tab, updates the visible workspace, and
returns the complete result or a structured DuckDB error. Results are not
artificially limited; agents are responsible for adding `LIMIT` when
appropriate.

Input: `tab_id: string`

The result includes:

- effective tab ID and SQL
- statement type
- columns and complete rows
- result row count
- execution time
- whether the catalog changed
- error details

Custom SQL run from a file tab is moved into a new `RESULT` tab, matching the
human interface. Schema-changing statements reconcile file tabs and table
metadata with the live catalog.

### `get_help`

Returns concise instructions about files, tabs, SQL, table navigation, search,
export, and privacy.

Input: `topic` or a natural-language question (optional)

## Agent workflows

Autonomous analysis:

```text
list_tables -> create_query_tab -> write_query -> run_query
                                      ^              |
                                      |-- revise ----|
```

Copilot query drafting:

```text
list_tables -> create_query_tab -> write_query -> user reviews and runs
```

All tab operations use stable IDs rather than mutable or duplicate display
names.

## Privacy and safety

Files and DuckDB execution stay in the browser. Data returned by a WebMCP tool
is shared with the user's chosen browser agent. Tools that return file-derived
content use `untrustedContentHint`, and tools that do not change state use
`readOnlyHint`.
