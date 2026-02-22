import type { JsonValue, JsonObject, JsonArray } from "./fileLoader";

export interface SanitizeResult {
  data: JsonValue;
  modifiedCount: number;
}

function sanitizeString(s: string): { result: string; modified: boolean } {
  // Process character by character to correctly handle already-escaped sequences
  // This ensures idempotence: sanitize(sanitize(x)) === sanitize(x)
  let result = "";
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    const code = s.charCodeAt(i);

    if (ch === "\\") {
      // Look ahead: keep already-escaped sequences we produce: \\, \", \n, \r
      const next = s[i + 1];
      if (next === "\\" || next === '"' || next === "n" || next === "r") {
        // Already escaped — pass through unchanged
        result += ch + next;
        i += 2;
      } else {
        // Bare backslash — escape it
        result += "\\\\";
        i++;
      }
    } else if (ch === '"') {
      // Bare double quote — escape it
      result += '\\"';
      i++;
    } else if (ch === "\n") {
      result += "\\n";
      i++;
    } else if (ch === "\r") {
      result += "\\r";
      i++;
    } else if (ch === "\t") {
      // Preserve tab
      result += ch;
      i++;
    } else if (code >= 0x00 && code <= 0x1f) {
      // Remove other control chars (null bytes, etc.)
      i++;
    } else {
      result += ch;
      i++;
    }
  }
  return { result, modified: result !== s };
}

function sanitizeValue(value: JsonValue): { data: JsonValue; count: number } {
  if (typeof value === "string") {
    const { result, modified } = sanitizeString(value);
    return { data: result, count: modified ? 1 : 0 };
  }
  if (Array.isArray(value)) {
    let count = 0;
    const arr: JsonArray = (value as JsonArray).map((item) => {
      const { data, count: c } = sanitizeValue(item);
      count += c;
      return data;
    });
    return { data: arr, count };
  }
  if (value !== null && typeof value === "object") {
    let count = 0;
    const obj: JsonObject = {};
    for (const [k, v] of Object.entries(value as JsonObject)) {
      const { data, count: c } = sanitizeValue(v);
      obj[k] = data;
      count += c;
    }
    return { data: obj, count };
  }
  // number, boolean, null — unchanged
  return { data: value, count: 0 };
}

export function sanitizeUnixSafe(data: JsonValue): SanitizeResult {
  const { data: sanitized, count } = sanitizeValue(data);
  return { data: sanitized, modifiedCount: count };
}
