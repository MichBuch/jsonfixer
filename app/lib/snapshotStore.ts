import type { JsonValue } from "./fileLoader";

export interface Snapshot {
  id: string;
  name: string;
  timestamp: string;
  data: JsonValue;
}

export class SnapshotStore {
  private snapshots: Snapshot[] = [];
  private counter = 0;

  save(name: string, data: JsonValue): Snapshot {
    const snapshot: Snapshot = {
      id: `snap-${++this.counter}-${Date.now()}`,
      name,
      timestamp: new Date().toISOString(),
      data: JSON.parse(JSON.stringify(data)), // deep clone
    };
    this.snapshots.push(snapshot);
    return snapshot;
  }

  restore(id: string): Snapshot | undefined {
    return this.snapshots.find((s) => s.id === id);
  }

  list(): Snapshot[] {
    return [...this.snapshots].reverse(); // most recent first
  }
}
