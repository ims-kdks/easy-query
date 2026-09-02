import type { ColumnInfo } from "./client";
import { escapeIdentifier, escapeLiteral } from "./queries";

const UI_QUERY_ALIAS = "__csv_studio_ui";

export type SortDirection = "asc" | "desc" | "none";
export type SortState = { column: string; direction: "asc" | "desc" };
export type FilterState = { column: string; value: string };

export function stripTrailingSemicolons(sql: string): string {
  return sql.trim().replace(/;+\s*$/, "");
}

export function isReadableQuery(sql: string): boolean {
  return /^(SELECT|WITH)\b/i.test(sql);
}

export function buildTableQuery(tableName: string): string {
  return `SELECT * FROM "${escapeIdentifier(tableName)}"`;
}

export function buildDefaultTableQuery(tableName?: string): string {
  if (!tableName) {
    return 'SELECT * FROM "data"';
  }

  return buildTableQuery(tableName);
}

export function buildUiQuery(params: {
  baseQuery: string;
  activeFilter: FilterState | null;
  activeSearchTerm: string;
  activeSort: SortState | null;
  columns: ColumnInfo[];
}): string {
  const { baseQuery, activeFilter, activeSearchTerm, activeSort, columns } =
    params;

  let wrappedQuery = `SELECT * FROM (${baseQuery}) AS "${UI_QUERY_ALIAS}"`;
  const conditions: string[] = [];

  if (activeFilter?.value) {
    const quotedColumn = `"${escapeIdentifier(activeFilter.column)}"`;
    const escapedValue = escapeLiteral(activeFilter.value);
    conditions.push(
      `CAST(${quotedColumn} AS VARCHAR) ILIKE '%${escapedValue}%'`,
    );
  }

  if (activeSearchTerm) {
    const escapedTerm = escapeLiteral(activeSearchTerm);
    const searchConditions = columns
      .map(
        (col) =>
          `CAST("${escapeIdentifier(col.name)}" AS VARCHAR) ILIKE '%${escapedTerm}%'`,
      )
      .join(" OR ");
    conditions.push(`(${searchConditions})`);
  }

  if (conditions.length > 0) {
    wrappedQuery += ` WHERE ${conditions.join(" AND ")}`;
  }

  if (activeSort) {
    const quotedColumn = `"${escapeIdentifier(activeSort.column)}"`;
    wrappedQuery += ` ORDER BY ${quotedColumn} ${activeSort.direction.toUpperCase()}`;
  }

  return wrappedQuery;
}
