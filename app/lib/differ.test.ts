import { describe, it, expect } from "vitest";
import { summarizeDiff, lineDiff } from "./differ";

describe("summarizeDiff", () => {
  it("detects added keys", () => {
    const src = { a: 1 };
    const edit = { a: 1, b: 2 };
    const { added, removed, modified } = summarizeDiff(src, edit);
    expect(added).toBe(1);
    expect(removed).toBe(0);
    expect(modified).toBe(0);
  });

  it("detects removed keys", () => {
    const src = { a: 1, b: 2 };
    const edit = { a: 1 };
    const { added, removed, modified } = summarizeDiff(src, edit);
    expect(added).toBe(0);
    expect(removed).toBe(1);
    expect(modified).toBe(0);
  });

  it("detects modified keys", () => {
    const src = { a: 1 };
    const edit = { a: 99 };
    const { added, removed, modified } = summarizeDiff(src, edit);
    expect(modified).toBe(1);
    expect(added).toBe(0);
    expect(removed).toBe(0);
  });

  it("returns zeros for identical objects", () => {
    const obj = { a: 1, b: "hello" };
    const { added, removed, modified } = summarizeDiff(obj, { ...obj });
    expect(added).toBe(0);
    expect(removed).toBe(0);
    expect(modified).toBe(0);
  });
});

describe("lineDiff", () => {
  it("marks unchanged lines", () => {
    const text = "line1\nline2";
    const result = lineDiff(text, text);
    expect(result.every((e) => e.type === "unchanged")).toBe(true);
  });

  it("marks added lines", () => {
    const result = lineDiff("a\nb", "a\nb\nc");
    const added = result.filter((e) => e.type === "added");
    expect(added.length).toBe(1);
    expect(added[0].line).toBe("c");
  });

  it("marks removed lines", () => {
    const result = lineDiff("a\nb\nc", "a\nb");
    const removed = result.filter((e) => e.type === "removed");
    expect(removed.length).toBe(1);
    expect(removed[0].line).toBe("c");
  });
});
