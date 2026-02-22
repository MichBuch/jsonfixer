import { describe, it, expect } from "vitest";
import { SnapshotStore } from "./snapshotStore";

describe("SnapshotStore", () => {
  it("saves and restores a snapshot", () => {
    const store = new SnapshotStore();
    const data = { items: [{ name: "Alice" }] };
    const snap = store.save("my-snap", data);
    const restored = store.restore(snap.id);
    expect(restored?.data).toEqual(data);
  });

  it("list returns most recent first", () => {
    const store = new SnapshotStore();
    store.save("first", { a: 1 });
    store.save("second", { b: 2 });
    store.save("third", { c: 3 });
    const list = store.list();
    expect(list[0].name).toBe("third");
    expect(list[1].name).toBe("second");
    expect(list[2].name).toBe("first");
  });

  it("restore returns undefined for unknown id", () => {
    const store = new SnapshotStore();
    expect(store.restore("nonexistent")).toBeUndefined();
  });

  it("saved data is deep-cloned (mutations don't affect snapshot)", () => {
    const store = new SnapshotStore();
    const data: any = { items: [{ name: "Alice" }] };
    const snap = store.save("test", data);
    data.items[0].name = "MUTATED";
    const restored = store.restore(snap.id);
    expect((restored?.data as any).items[0].name).toBe("Alice");
  });

  it("multiple snapshots all remain available", () => {
    const store = new SnapshotStore();
    const s1 = store.save("s1", { v: 1 });
    const s2 = store.save("s2", { v: 2 });
    expect(store.restore(s1.id)?.data).toEqual({ v: 1 });
    expect(store.restore(s2.id)?.data).toEqual({ v: 2 });
  });
});
