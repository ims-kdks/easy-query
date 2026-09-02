export function escapeIdentifier(name: string): string {
  return name.replace(/"/g, '""');
}

export function escapeLiteral(value: string): string {
  return value.replace(/'/g, "''");
}
