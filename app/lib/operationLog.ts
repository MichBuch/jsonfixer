export interface LogEntry {
  timestamp: string;
  operation:
    | "load"
    | "scan"
    | "sort"
    | "edit"
    | "sanitize"
    | "undo"
    | "snapshot-save"
    | "snapshot-restore"
    | "save";
  path?: string;
  params?: Record<string, unknown>;
  status: "ok" | "error";
  detail?: string;
}

export class OperationLog {
  private entries: LogEntry[] = [];

  append(entry: LogEntry): void {
    this.entries.push({ ...entry });
  }

  getAll(): LogEntry[] {
    return [...this.entries];
  }

  exportText(): string {
    return this.entries
      .map((e) => {
        const parts = [
          `[${e.timestamp}]`,
          e.operation.toUpperCase(),
          e.path ? `path=${e.path}` : null,
          e.params ? `params=${JSON.stringify(e.params)}` : null,
          `status=${e.status}`,
          e.detail ? `detail=${e.detail}` : null,
        ].filter(Boolean);
        return parts.join(" | ");
      })
      .join("\n");
  }
}
