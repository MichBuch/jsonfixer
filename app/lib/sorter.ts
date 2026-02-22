import type { JsonValue, JsonObject, JsonArray } from "./fileLoader";

export interface SortParams {
  containerPath: string;
  sortKey: string;
  direction: "asc" | "desc";
}

export interface MovementEntry {
  oldIndex: number;
  newIndex: number;
  fromLine: number;
  toLine: number;
  keyValue: string;
}

export interface SortReport {
  containerPath: string;
  sortKey: string;
  direction: "asc" | "desc";
  countBefore: number;
  countAfter: number;
  integrityPassed: boolean;
  movementLog: MovementEntry[];
  durationMs: number;
  error?: string;
}

export interface SortResult {
  data: JsonValue;
  report: SortReport;
}

function isObject(v: JsonValue): v is JsonObject {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isArray(v: JsonValue): v is JsonArray {
  return Array.isArray(v);
}

/** Resolve a dot-notation path and return the value + a setter */
function resolvePath(
  root: JsonValue,
  path: string
): { value: JsonValue; set: (v: JsonValue) => JsonValue } | null {
  if (!path || path === "(root)") {
    return { value: root, set: (v) => v };
  }
  const parts = path.split(".");
  let current: JsonValue = root;
  const trail: { parent: JsonObject | JsonArray; key: string | number }[] = [];

  for (const part of parts) {
    if (isObject(current)) {
      trail.push({ parent: current, key: part });
      current = (current as JsonObject)[part] ?? null;
    } else if (isArray(current)) {
      const idx = parseInt(part, 10);
      trail.push({ parent: current, key: idx });
      current = (current as JsonArray)[idx] ?? null;
    } else {
      return null;
    }
  }

  const set = (newVal: JsonValue): JsonValue => {
    // Deep-clone root and set the value at path
    const cloned = JSON.parse(JSON.stringify(root)) as JsonValue;
    let node: JsonValue = cloned;
    for (let i = 0; i < parts.length - 1; i++) {
      if (isObject(node)) node = (node as JsonObject)[parts[i]];
      else if (isArray(node)) node = (node as JsonArray)[parseInt(parts[i], 10)];
      else return cloned;
    }
    const lastKey = parts[parts.length - 1];
    if (isObject(node)) (node as JsonObject)[lastKey] = newVal;
    else if (isArray(node)) (node as JsonArray)[parseInt(lastKey, 10)] = newVal;
    return cloned;
  };

  return { value: current, set };
}

/** Compute line numbers of each element's opening brace in formatted JSON */
function computeElementLines(elements: JsonValue[]): number[] {
  const lines: number[] = [];
  let lineNum = 1;
  for (const el of elements) {
    lines.push(lineNum);
    const serialized = JSON.stringify(el, null, 2);
    lineNum += serialized.split("\n").length + 1; // +1 for comma/separator line
  }
  return lines;
}

/** Get sort key value as string for comparison */
function getKeyValue(el: JsonValue, key: string): string {
  if (!isObject(el)) return "";
  const v = (el as JsonObject)[key];
  if (v === null || v === undefined) return "";
  return String(v);
}

/** Numeric-aware comparison */
function compareValues(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (!isNaN(na) && !isNaN(nb)) return na - nb;
  return a.localeCompare(b);
}

export function sortContainer(data: JsonValue, params: SortParams): SortResult {
  const start = Date.now();
  const { containerPath, sortKey, direction } = params;

  const makeErrorReport = (error: string): SortResult => ({
    data,
    report: {
      containerPath,
      sortKey,
      direction,
      countBefore: 0,
      countAfter: 0,
      integrityPassed: false,
      movementLog: [],
      durationMs: Date.now() - start,
      error,
    },
  });

  const resolved = resolvePath(data, containerPath);
  if (!resolved) return makeErrorReport(`Path not found: ${containerPath}`);
  if (!isArray(resolved.value)) return makeErrorReport(`Path does not resolve to an array: ${containerPath}`);

  const container = resolved.value as JsonArray;
  const countBefore = container.length;

  // Compute fromLine for each element
  const fromLines = computeElementLines(container);

  // Stable sort: attach original index, sort, then record movement
  const indexed = container.map((el, i) => ({ el, i }));
  indexed.sort((a, b) => {
    const va = getKeyValue(a.el, sortKey);
    const vb = getKeyValue(b.el, sortKey);
    const cmp = compareValues(va, vb);
    if (cmp !== 0) return direction === "asc" ? cmp : -cmp;
    return a.i - b.i; // stable: preserve original order for ties
  });

  const sortedContainer: JsonArray = indexed.map((x) => x.el);
  const countAfter = sortedContainer.length;

  // Compute toLine for each element in sorted order
  const toLines = computeElementLines(sortedContainer);

  // Build movement log
  const movementLog: MovementEntry[] = indexed.map((x, newIndex) => ({
    oldIndex: x.i,
    newIndex,
    fromLine: fromLines[x.i],
    toLine: toLines[newIndex],
    keyValue: getKeyValue(x.el, sortKey),
  }));

  // Integrity check 1: count
  if (countBefore !== countAfter) {
    return {
      data,
      report: {
        containerPath, sortKey, direction,
        countBefore, countAfter,
        integrityPassed: false,
        movementLog,
        durationMs: Date.now() - start,
        error: `Count mismatch: ${countBefore} before, ${countAfter} after`,
      },
    };
  }

  // Integrity check 2: bijection
  const oldIndices = new Set(movementLog.map((e) => e.oldIndex));
  const newIndices = new Set(movementLog.map((e) => e.newIndex));
  const expected = new Set(Array.from({ length: countBefore }, (_, i) => i));
  const bijectionOk =
    oldIndices.size === countBefore &&
    newIndices.size === countBefore &&
    Array.from(expected).every((i) => oldIndices.has(i) && newIndices.has(i));

  if (!bijectionOk) {
    return {
      data,
      report: {
        containerPath, sortKey, direction,
        countBefore, countAfter,
        integrityPassed: false,
        movementLog,
        durationMs: Date.now() - start,
        error: "Bijection check failed: movement log indices are not a complete permutation",
      },
    };
  }

  const newData = resolved.set(sortedContainer);

  return {
    data: newData,
    report: {
      containerPath, sortKey, direction,
      countBefore, countAfter,
      integrityPassed: true,
      movementLog,
      durationMs: Date.now() - start,
    },
  };
}
