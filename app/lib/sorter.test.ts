import { describe, it, expect } from "vitest";
import { sortContainer } from "./sorter";

const items = [
  { name: "Charlie", score: 30 },
  { name: "Alice", score: 10 },
  { name: "Bob", score: 20 },
];

describe("sortContainer", () => {
  it("sorts by string key ascending", () => {
    const data = { items: [...items] };
    const { data: result, report } = sortContainer(data, {
      containerPath: "items",
      sortKey: "name",
      direction: "asc",
    });
    const sorted = (result as any).items;
    expect(sorted[0].name).toBe("Alice");
    expect(sorted[1].name).toBe("Bob");
    expect(sorted[2].name).toBe("Charlie");
    expect(report.integrityPassed).toBe(true);
  });

  it("sorts by string key descending", () => {
    const data = { items: [...items] };
    const { data: result } = sortContainer(data, {
      containerPath: "items",
      sortKey: "name",
      direction: "desc",
    });
    const sorted = (result as any).items;
    expect(sorted[0].name).toBe("Charlie");
    expect(sorted[2].name).toBe("Alice");
  });

  it("sorts by numeric key", () => {
    const data = { items: [...items] };
    const { data: result } = sortContainer(data, {
      containerPath: "items",
      sortKey: "score",
      direction: "asc",
    });
    const sorted = (result as any).items;
    expect(sorted[0].score).toBe(10);
    expect(sorted[1].score).toBe(20);
    expect(sorted[2].score).toBe(30);
  });

  it("is stable for equal keys", () => {
    const data = {
      items: [
        { name: "A", group: "x" },
        { name: "B", group: "x" },
        { name: "C", group: "y" },
      ],
    };
    const { data: result } = sortContainer(data, {
      containerPath: "items",
      sortKey: "group",
      direction: "asc",
    });
    const sorted = (result as any).items;
    // A and B both have group "x" — original order preserved
    expect(sorted[0].name).toBe("A");
    expect(sorted[1].name).toBe("B");
    expect(sorted[2].name).toBe("C");
  });

  it("returns error for invalid path", () => {
    const { data: result, report } = sortContainer({ a: 1 }, {
      containerPath: "nonexistent",
      sortKey: "name",
      direction: "asc",
    });
    expect(report.integrityPassed).toBe(false);
    expect(report.error).toBeDefined();
    expect(result).toEqual({ a: 1 }); // original unchanged
  });

  it("returns error when path is not an array", () => {
    const { report } = sortContainer({ a: { b: 1 } }, {
      containerPath: "a",
      sortKey: "b",
      direction: "asc",
    });
    expect(report.integrityPassed).toBe(false);
  });

  it("handles empty array", () => {
    const data = { items: [] };
    const { report } = sortContainer(data, {
      containerPath: "items",
      sortKey: "name",
      direction: "asc",
    });
    expect(report.integrityPassed).toBe(true);
    expect(report.countBefore).toBe(0);
    expect(report.movementLog.length).toBe(0);
  });

  it("handles single-element array", () => {
    const data = { items: [{ name: "only" }] };
    const { report } = sortContainer(data, {
      containerPath: "items",
      sortKey: "name",
      direction: "asc",
    });
    expect(report.integrityPassed).toBe(true);
    expect(report.movementLog.length).toBe(1);
  });

  it("movement log has correct oldIndex/newIndex bijection", () => {
    const data = { items: [...items] };
    const { report } = sortContainer(data, {
      containerPath: "items",
      sortKey: "name",
      direction: "asc",
    });
    const oldSet = new Set(report.movementLog.map((e) => e.oldIndex));
    const newSet = new Set(report.movementLog.map((e) => e.newIndex));
    expect(oldSet.size).toBe(3);
    expect(newSet.size).toBe(3);
    for (let i = 0; i < 3; i++) {
      expect(oldSet.has(i)).toBe(true);
      expect(newSet.has(i)).toBe(true);
    }
  });

  it("movement log records keyValue", () => {
    const data = { items: [...items] };
    const { report } = sortContainer(data, {
      containerPath: "items",
      sortKey: "name",
      direction: "asc",
    });
    const values = report.movementLog.map((e) => e.keyValue);
    expect(values).toContain("Alice");
    expect(values).toContain("Bob");
    expect(values).toContain("Charlie");
  });
});
