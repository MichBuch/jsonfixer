import type { JsonValue, JsonObject } from "./fileLoader";

export interface DiffSummary {
  added: number;
  removed: number;
  modified: number;
}

export type LineDiffType = "added" | "removed" | "unchanged";

export interface LineDiffEntry {
  type: LineDiffType;
  line: string;
}

function isObject(v: JsonValue): v is JsonObject {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function summarizeDiff(source: JsonValue, edited: JsonValue): DiffSummary {
  const srcKeys = isObject(source) ? new Set(Object.keys(source as JsonObject)) : new Set<string>();
  const editKeys = isObject(edited) ? new Set(Object.keys(edited as JsonObject)) : new Set<string>();

  let added = 0;
  let removed = 0;
  let modified = 0;

  for (const k of editKeys) {
    if (!srcKeys.has(k)) {
      added++;
    } else {
      const sv = JSON.stringify((source as JsonObject)[k]);
      const ev = JSON.stringify((edited as JsonObject)[k]);
      if (sv !== ev) modified++;
    }
  }

  for (const k of srcKeys) {
    if (!editKeys.has(k)) removed++;
  }

  return { added, removed, modified };
}

export function lineDiff(sourceText: string, editedText: string): LineDiffEntry[] {
  const srcLines = sourceText.split("\n");
  const editLines = editedText.split("\n");

  // Simple LCS-based line diff
  const m = srcLines.length;
  const n = editLines.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (srcLines[i - 1] === editLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack
  const result: LineDiffEntry[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && srcLines[i - 1] === editLines[j - 1]) {
      result.push({ type: "unchanged", line: srcLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: "added", line: editLines[j - 1] });
      j--;
    } else {
      result.push({ type: "removed", line: srcLines[i - 1] });
      i--;
    }
  }

  return result.reverse();
}
