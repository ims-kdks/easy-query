export interface WorkspaceTab {
  id: string;
  name: string;
  type: string;
  sql: string;
  tableName?: string;
  fileName?: string;
}
