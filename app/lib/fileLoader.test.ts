import { describe, it, expect } from "vitest";
import { parseJsonFile } from "./fileLoader";

describe("parseJsonFile", () => {
  it("parses valid JSON object", () => {
    const result = parseJsonFile('{"a":1}', "test.json");
    expect(result.error).toBeUndefined();
    expect(result.data).toEqual({ a: 1 });
    expect(result.filename).toBe("test.json");
    expect(result.sizeBytes).toBeGreaterThan(0);
  });

  it("parses valid JSON array", () => {
    const result = parseJsonFile('[1,2,3]');
    expect(result.data).toEqual([1, 2, 3]);
  });

  it("returns error for invalid JSON", () => {
    const result = parseJsonFile("{bad json}");
    expect(result.error).toBeDefined();
    expect(result.data).toBeUndefined();
  });

  it("returns error for empty string", () => {
    const result = parseJsonFile("");
    expect(result.error).toBeDefined();
  });

  it("parses nested structures", () => {
    const input = JSON.stringify({ a: { b: [1, 2, { c: true }] } });
    const result = parseJsonFile(input);
    expect(result.data).toEqual({ a: { b: [1, 2, { c: true }] } });
  });
});
