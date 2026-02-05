/**
 * Path Analysis Utility for JSON Structure
 * Identifies sortable containers and available sort fields within any JSON structure
 */

type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];

export interface ContainerInfo {
  path: string;
  type: "array" | "object";
  depth: number;
  itemCount: number;
  availableFields?: string[]; // For arrays: common fields across items
}

export interface StructureAnalysis {
  containers: ContainerInfo[];
  maxDepth: number;
}

/**
 * Check if value is an object (not array, not null)
 */
function isObject(val: JsonValue): val is JsonObject {
  return val !== null && typeof val === "object" && !Array.isArray(val);
}

/**
 * Check if value is an array
 */
function isArray(val: JsonValue): val is JsonArray {
  return Array.isArray(val);
}

/**
 * Extract all unique field names from array items
 * This helps identify what fields are available for sorting within an array
 */
function extractArrayFields(arr: JsonArray): string[] {
  const fieldSets: Set<string>[] = [];

  arr.forEach((item) => {
    if (isObject(item)) {
      const fields = new Set<string>();

      // Get all keys from this object
      Object.keys(item).forEach((key) => fields.add(key));

      // Also extract nested paths (one level deep for common use cases)
      Object.entries(item).forEach(([key, value]) => {
        if (isObject(value)) {
          Object.keys(value).forEach((nestedKey) => {
            fields.add(`${key}.${nestedKey}`);
          });
        }
        // Note: Arrays are just referenced by their field name without bracket notation
        // User can sort by the array field itself (will compare first element or JSON stringified values)
      });

      fieldSets.push(fields);
    }
  });

  if (fieldSets.length === 0) return [];

  // Return union of all fields (any field that appears in at least one item)
  const allFields = new Set<string>();
  fieldSets.forEach((fieldSet) => {
    fieldSet.forEach((field) => allFields.add(field));
  });

  return Array.from(allFields).sort();
}

/**
 * Traverse JSON structure and identify all sortable containers
 */
export function analyzeJsonStructure(data: JsonValue): StructureAnalysis {
  const containers: ContainerInfo[] = [];
  let maxDepth = 0;

  function traverse(value: JsonValue, path: string, depth: number): void {
    maxDepth = Math.max(maxDepth, depth);

    if (isArray(value)) {
      // Array is a sortable container
      const availableFields = extractArrayFields(value);
      containers.push({
        path: path || "root",
        type: "array",
        depth,
        itemCount: value.length,
        availableFields,
      });

      // Continue traversing array items
      value.forEach((item, idx) => {
        traverse(item, path ? `${path}[${idx}]` : `[${idx}]`, depth + 1);
      });
    } else if (isObject(value)) {
      // Object is a sortable container (we can sort its keys)
      const keys = Object.keys(value);
      containers.push({
        path: path || "root",
        type: "object",
        depth,
        itemCount: keys.length,
      });

      // Continue traversing object properties
      keys.forEach((key) => {
        const newPath = path ? `${path}.${key}` : key;
        traverse(value[key], newPath, depth + 1);
      });
    }
  }

  traverse(data, "", 0);

  return { containers, maxDepth };
}

/**
 * Get list of sortable container paths from analyzed structure
 */
export function getSortableContainers(analysis: StructureAnalysis): ContainerInfo[] {
  return analysis.containers.filter((c) => c.itemCount > 0);
}

/**
 * Get ALL unique paths from the structure (for protection dropdown)
 * Strips out array indices to show clean container paths
 */
export function getAllPaths(analysis: StructureAnalysis): string[] {
  const paths = new Set<string>();

  analysis.containers.forEach(c => {
    if (c.path && c.path !== 'root') {
      // Remove array index notation like [0], [1], etc.
      const cleanPath = c.path.replace(/\[.*?\]/g, '');
      if (cleanPath && !cleanPath.includes('[')) {
        paths.add(cleanPath);
      }
    }
  });

  return Array.from(paths).sort();
}

/**
 * Get available sort fields for a specific container path
 */
export function getSortFieldsForContainer(
  analysis: StructureAnalysis,
  containerPath: string
): string[] {
  const container = analysis.containers.find((c) => c.path === containerPath);

  if (!container) return [];

  if (container.type === "array") {
    return container.availableFields || [];
  } else {
    // For objects, we sort by keys (no specific fields needed)
    return ["(keys)"];
  }
}

/**
 * Evaluate a path in the data and return the value
 * Supports dot notation (obj.key) and array indexing (arr[0])
 */
export function evaluatePath(data: JsonValue, path: string): JsonValue {
  if (!path || path === "root") return data;

  const parts = path.split(/\.|\[/).map((p) => p.replace(/\]$/, ""));
  let current: JsonValue = data;

  for (const part of parts) {
    if (!part) continue;

    if (current === null || typeof current !== "object") {
      return null;
    }

    if (isArray(current)) {
      const idx = parseInt(part, 10);
      if (isNaN(idx) || idx >= current.length) return null;
      current = current[idx];
    } else {
      current = (current as JsonObject)[part];
    }
  }

  return current;
}

/**
 * Get a value from an object using a field path (supports nested paths)
 * For array fields, if the field value is an array, it will take the first element for sorting
 */
export function getFieldValue(obj: JsonValue, fieldPath: string): JsonValue {
  if (!fieldPath || fieldPath === "(keys)") return obj;

  const parts = fieldPath.split(".");
  let current: JsonValue = obj;

  for (const part of parts) {
    if (!part) continue;

    if (current === null || typeof current !== "object") {
      return null;
    }

    if (isArray(current)) {
      // If we encounter an array in the path, use index 0
      const idx = 0;
      if (idx >= current.length) return null;
      current = current[idx];
    }

    // Get the property
    current = (current as JsonObject)[part];
  }

  // If the final value is an array, return the first element for sorting purposes
  if (isArray(current) && current.length > 0) {
    return current[0];
  }

  return current;
}

/**
 * Check if a path matches a protection pattern
 * Supports exact match, prefix match (path.*), and wildcard (*.field)
 */
export function isPathProtected(path: string, protectedPatterns: string[]): boolean {
  for (const pattern of protectedPatterns) {
    // Exact match
    if (pattern === path) return true;

    // Prefix match: "view.classes.*" matches "view.classes.anything"
    if (pattern.endsWith(".*")) {
      const prefix = pattern.slice(0, -2);
      if (path === prefix || path.startsWith(prefix + ".")) return true;
    }

    // Wildcard match: "*.internal" matches any path ending with ".internal"
    if (pattern.startsWith("*.")) {
      const suffix = pattern.slice(1); // Keep the dot
      if (path.endsWith(suffix)) return true;
    }
  }

  return false;
}
