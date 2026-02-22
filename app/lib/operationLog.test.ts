import { describe, it, expect } from "vitest";
import { OperationLog } from "./operationLog";

describe("OperationLog", () => {
  it("starts empty", () => {
    const log = new OperationLog();
    expect(log.getAll()).toHaveLength(0);
  });

  it("appends entries", () => {
    const log = new OperationLog();
    log.append({ timestamp: "2024-01-01T00:00:00Z", operation: "load", status: "ok" });
    expect(log.getAll()).toHaveLength(1);
  });

  it("getAll returns a copy (not mutating internal state)", () => {
    const log = new OperationLog();
    log.append({ timestamp: "t1", operation: "load", status: "ok" });
    const all = log.getAll();
    all.push({ timestamp: "t2", operation: "save", status: "ok" });
    expect(log.getAll()).toHaveLength(1);
  });

  it("exportText includes all entries", () => {
    const log = new OperationLog();
    log.append({ timestamp: "2024-01-01T00:00:00Z", operation: "load", status: "ok", detail: "test.json" });
    log.append({ timestamp: "2024-01-01T00:01:00Z", operation: "sort", status: "ok", path: "items" });
    const text = log.exportText();
    expect(text).toContain("LOAD");
    expect(text).toContain("SORT");
    expect(text).toContain("test.json");
    expect(text).toContain("items");
  });

  it("entries are append-only — prior entries not mutated", () => {
    const log = new OperationLog();
    log.append({ timestamp: "t1", operation: "load", status: "ok" });
    const before = log.getAll()[0];
    log.append({ timestamp: "t2", operation: "save", status: "ok" });
    const after = log.getAll()[0];
    expect(after).toEqual(before);
  });
});
