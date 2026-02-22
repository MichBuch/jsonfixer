import { describe, it, expect } from "vitest";
import { sanitizeUnixSafe } from "./sanitizer";

describe("sanitizeUnixSafe", () => {
  describe("string sanitization", () => {
    it("leaves a clean string unchanged", () => {
      const { data, modifiedCount } = sanitizeUnixSafe("hello world");
      expect(data).toBe("hello world");
      expect(modifiedCount).toBe(0);
    });

    it("escapes double quotes", () => {
      const { data, modifiedCount } = sanitizeUnixSafe('say "hello"');
      expect(data).toBe('say \\"hello\\"');
      expect(modifiedCount).toBe(1);
    });

    it("escapes backslashes", () => {
      const { data, modifiedCount } = sanitizeUnixSafe("C:\\Users\\foo");
      expect(data).toBe("C:\\\\Users\\\\foo");
      expect(modifiedCount).toBe(1);
    });

    it("replaces bare newline with \\n escape sequence", () => {
      const { data, modifiedCount } = sanitizeUnixSafe("line1\nline2");
      expect(data).toBe("line1\\nline2");
      expect(modifiedCount).toBe(1);
    });

    it("replaces bare carriage return with \\r escape sequence", () => {
      const { data, modifiedCount } = sanitizeUnixSafe("line1\rline2");
      expect(data).toBe("line1\\rline2");
      expect(modifiedCount).toBe(1);
    });

    it("removes null bytes", () => {
      const { data, modifiedCount } = sanitizeUnixSafe("hel\x00lo");
      expect(data).toBe("hello");
      expect(modifiedCount).toBe(1);
    });

    it("removes control chars U+0001–U+001F except \\t, \\n, \\r", () => {
      // \x01 (SOH), \x0B (VT), \x1F (US) should be removed
      const { data, modifiedCount } = sanitizeUnixSafe("a\x01b\x0Bc\x1Fd");
      expect(data).toBe("abcd");
      expect(modifiedCount).toBe(1);
    });

    it("preserves tab character", () => {
      const { data, modifiedCount } = sanitizeUnixSafe("col1\tcol2");
      expect(data).toBe("col1\tcol2");
      expect(modifiedCount).toBe(0);
    });

    it("handles backslash before quote correctly (already escaped — pass through)", () => {
      // Input: \" (backslash then quote) — already an escape sequence, pass through unchanged
      const { data, modifiedCount } = sanitizeUnixSafe('\\"');
      expect(data).toBe('\\"');
      expect(modifiedCount).toBe(0);
    });

    it("is idempotent — applying twice gives same result as once", () => {
      const inputs = [
        'hello "world"',
        "C:\\path\\to\\file",
        "line1\nline2\rline3",
        "null\x00byte",
        "mixed\x01\x0B\nand\r\ttabs",
      ];
      for (const input of inputs) {
        const once = sanitizeUnixSafe(input).data;
        const twice = sanitizeUnixSafe(once as string).data;
        expect(twice).toBe(once);
      }
    });
  });

  describe("non-string values", () => {
    it("leaves numbers unchanged", () => {
      const { data, modifiedCount } = sanitizeUnixSafe(42);
      expect(data).toBe(42);
      expect(modifiedCount).toBe(0);
    });

    it("leaves booleans unchanged", () => {
      const { data: t } = sanitizeUnixSafe(true);
      const { data: f } = sanitizeUnixSafe(false);
      expect(t).toBe(true);
      expect(f).toBe(false);
    });

    it("leaves null unchanged", () => {
      const { data, modifiedCount } = sanitizeUnixSafe(null);
      expect(data).toBeNull();
      expect(modifiedCount).toBe(0);
    });
  });

  describe("nested structures", () => {
    it("sanitizes strings inside objects", () => {
      const input = { name: 'Alice "A"', age: 30 };
      const { data, modifiedCount } = sanitizeUnixSafe(input);
      expect((data as typeof input).name).toBe('Alice \\"A\\"');
      expect((data as typeof input).age).toBe(30);
      expect(modifiedCount).toBe(1);
    });

    it("sanitizes strings inside arrays", () => {
      const input = ["clean", 'has "quotes"', 42];
      const { data, modifiedCount } = sanitizeUnixSafe(input);
      expect((data as typeof input)[0]).toBe("clean");
      expect((data as typeof input)[1]).toBe('has \\"quotes\\"');
      expect((data as typeof input)[2]).toBe(42);
      expect(modifiedCount).toBe(1);
    });

    it("counts modifications across deeply nested structure", () => {
      const input = {
        a: 'has "quote"',
        b: { c: "has\nnewline", d: "clean" },
        e: ["also\x00null", "fine"],
      };
      const { modifiedCount } = sanitizeUnixSafe(input);
      expect(modifiedCount).toBe(3); // a, b.c, e[0]
    });

    it("returns modifiedCount=0 when nothing changes", () => {
      const input = { x: 1, y: true, z: null, w: "clean text" };
      const { modifiedCount } = sanitizeUnixSafe(input);
      expect(modifiedCount).toBe(0);
    });
  });
});
