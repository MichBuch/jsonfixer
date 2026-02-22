// Feature: json-editor-overhaul, Property 11: Movement log completeness
// Feature: json-editor-overhaul, Property 12: Movement log line accuracy
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { sortContainer } from "./sorter";

// Generator: array of objects all sharing a "name" key
const sortableData = fc
  .array(
    fc.record({ name: fc.string({ minLength: 1, maxLength: 20 }), val: fc.integer() }),
    { minLength: 1, maxLength: 30 }
  )
  .map((items) => ({ items }));

describe("Property 11: Movement log completeness", () => {
  it("movement log has exactly N entries and forms a complete bijection", () => {
    fc.assert(
      fc.property(sortableData, (data) => {
        const { report } = sortContainer(data, {
          containerPath: "items",
          sortKey: "name",
          direction: "asc",
        });
        if (!report.integrityPassed) return true; // skip integrity failures

        const N = data.items.length;
        expect(report.movementLog.length).toBe(N);

        const oldSet = new Set(report.movementLog.map((e) => e.oldIndex));
        const newSet = new Set(report.movementLog.map((e) => e.newIndex));
        expect(oldSet.size).toBe(N);
        expect(newSet.size).toBe(N);
        for (let i = 0; i < N; i++) {
          expect(oldSet.has(i)).toBe(true);
          expect(newSet.has(i)).toBe(true);
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });
});

describe("Property 12: Movement log line accuracy", () => {
  it("fromLine matches pre-sort element position, toLine matches post-sort position", () => {
    fc.assert(
      fc.property(sortableData, (data) => {
        const { data: sortedData, report } = sortContainer(data, {
          containerPath: "items",
          sortKey: "name",
          direction: "asc",
        });
        if (!report.integrityPassed) return true;

        // Reconstruct line numbers from pre-sort and post-sort serializations
        const preLines = computeElementLines(data.items);
        const postItems = (sortedData as any).items;
        const postLines = computeElementLines(postItems);

        for (const entry of report.movementLog) {
          expect(entry.fromLine).toBe(preLines[entry.oldIndex]);
          expect(entry.toLine).toBe(postLines[entry.newIndex]);
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });
});

function computeElementLines(elements: unknown[]): number[] {
  const lines: number[] = [];
  let lineNum = 1;
  for (const el of elements) {
    lines.push(lineNum);
    const serialized = JSON.stringify(el, null, 2);
    lineNum += serialized.split("\n").length + 1;
  }
  return lines;
}
