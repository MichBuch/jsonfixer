import type { JsonValue, JsonObject, JsonArray } from "./fileLoader";

export interface ContainerInfo {
  path: string;
  elementCount: number;
  availableKeys: string[];
}

export interface ScanResult {
  containers: ContainerInfo[];
  durationMs: number;
}

function isObject(v: JsonValue): v is JsonObject {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isArray(v: JsonValue): v is JsonArray {
  return Array.isArray(v);
}

function traverse(value: JsonValue, path: string, containers: ContainerInfo[]): void {
  if (isArray(value)) {
    const objectElements = value.filter(isObject) as JsonObject[];
    // All elements must be objects for the container to be sortable
    if (objectElements.length > 0 && objectElements.length === value.length) {
      // Find shared keys across all object elements (require at least 2 for sorting to make sense)
      const keySets = objectElements.map((el) => new Set(Object.keys(el)));
      const sharedKeys = [...keySets[0]].filter((k) =>
        keySets.every((s) => s.has(k))
      );
      if (sharedKeys.length > 0) {
        containers.push({
          path: path || "(root)",
          elementCount: value.length,
          availableKeys: sharedKeys,
        });
      }
    }
    // Recurse into each element
    value.forEach((item, i) => {
      traverse(item, path ? `${path}[${i}]` : `[${i}]`, containers);
    });
  } else if (isObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      traverse(child, path ? `${path}.${key}` : key, containers);
    }
  }
}

export function scanStructure(data: JsonValue): ScanResult {
  const start = Date.now();
  const containers: ContainerInfo[] = [];
  traverse(data, "", containers);
  return { containers, durationMs: Date.now() - start };
}
