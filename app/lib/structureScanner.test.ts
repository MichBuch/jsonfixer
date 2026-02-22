import { describe, it, expect } from "vitest";
import { scanStructure } from "./structureScanner";

describe("scanStructure", () => {
  it("finds a top-level sortable array", () => {
    const data = {
      items: [
        { name: "Alice", age: 30 },
        { name: "Bob", age: 25 },
      ],
    };
    const { containers } = scanStructure(data);
    expect(containers.length).toBe(1);
    expect(containers[0].path).toBe("items");
    expect(containers[0].elementCount).toBe(2);
    expect(containers[0].availableKeys).toContain("name");
    expect(containers[0].availableKeys).toContain("age");
  });

  it("returns empty for flat array of primitives", () => {
    const { containers } = scanStructure({ nums: [1, 2, 3] });
    expect(containers.length).toBe(0);
  });

  it("returns empty for empty object", () => {
    const { containers } = scanStructure({});
    expect(containers.length).toBe(0);
  });

  it("handles mixed-type arrays (not sortable)", () => {
    const { containers } = scanStructure({ mixed: [1, "two", { a: 1 }] });
    // Only 1 object element — no shared keys across all elements
    expect(containers.length).toBe(0);
  });

  it("finds nested sortable arrays", () => {
    const data = {
      dept: {
        employees: [
          { id: 1, name: "Alice" },
          { id: 2, name: "Bob" },
        ],
      },
    };
    const { containers } = scanStructure(data);
    expect(containers.some((c) => c.path.includes("employees"))).toBe(true);
  });

  it("records durationMs", () => {
    const { durationMs } = scanStructure({ a: [{ x: 1 }, { x: 2 }] });
    expect(typeof durationMs).toBe("number");
    expect(durationMs).toBeGreaterThanOrEqual(0);
  });

  it("only includes keys shared by ALL elements", () => {
    const data = {
      items: [
        { name: "A", extra: 1 },
        { name: "B" }, // no 'extra'
      ],
    };
    const { containers } = scanStructure(data);
    expect(containers[0].availableKeys).toContain("name");
    expect(containers[0].availableKeys).not.toContain("extra");
  });

  it("handles single-element array", () => {
    const data = { items: [{ name: "only" }] };
    const { containers } = scanStructure(data);
    expect(containers.length).toBe(1);
    expect(containers[0].elementCount).toBe(1);
  });
});
