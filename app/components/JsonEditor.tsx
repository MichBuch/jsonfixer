"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { isPathProtected } from "../utils/pathAnalyzer";

type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];

type SortMode = "a-z" | "z-a" | "num-asc" | "num-desc";

function isObject(v: JsonValue): v is JsonObject {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function getJsonLineCount(val: JsonValue): number {
  if (val === null || typeof val !== "object") return 1;
  const keys = Array.isArray(val) ? val : Object.keys(val);
  if (keys.length === 0) return 1; // Empty object/array takes 1 line in standard minified-pretty (e.g. "key": {})? 
  // Wait, standard JSON.stringify(x, null, 2) takes 3 lines for non-empty: "key": {\n ... \n}
  // But if empty, it's usually "key": {} (1 line) or "key": [\n] (2 lines)?
  // Let's assume standard behavior:
  // Primitive: 1 line
  // Non-empty Object/Array: 1 (start) + children + 1 (end)
  let count = 2;
  if (Array.isArray(val)) {
    for (const item of val) count += getJsonLineCount(item);
  } else {
    for (const k of Object.keys(val)) count += getJsonLineCount(val[k]);
  }
  return count;
}

function isArray(v: JsonValue): v is JsonArray {
  return Array.isArray(v);
}

function getValueAtPath(obj: JsonValue, path: string): JsonValue {
  const parts = path.split(".");
  let current: JsonValue = obj;
  for (const part of parts) {
    if (current === null || typeof current !== "object") return null;
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

function sortAtLevel(value: JsonObject | JsonArray, mode: SortMode, sortByPath?: string): void {
  if (isObject(value)) {
    const keys = Object.keys(value);
    const sorted = keys.sort((a, b) => {
      if (sortByPath) {
        const valA = getValueAtPath(value[a], sortByPath);
        const valB = getValueAtPath(value[b], sortByPath);
        const strA = valA === null ? "" : String(valA);
        const strB = valB === null ? "" : String(valB);
        if (mode === "a-z") return strA.localeCompare(strB);
        if (mode === "z-a") return strB.localeCompare(strA);
        const na = parseFloat(strA);
        const nb = parseFloat(strB);
        if (!isNaN(na) && !isNaN(nb)) {
          return mode === "num-asc" ? na - nb : nb - na;
        }
        return mode === "num-asc" ? strA.localeCompare(strB) : strB.localeCompare(strA);
      }
      if (mode === "a-z") return a.localeCompare(b);
      if (mode === "z-a") return b.localeCompare(a);
      const na = parseFloat(a);
      const nb = parseFloat(b);
      if (!isNaN(na) && !isNaN(nb)) {
        return mode === "num-asc" ? na - nb : nb - na;
      }
      return mode === "num-asc" ? a.localeCompare(b) : b.localeCompare(a);
    });
    const copy = sorted.map((k) => [k, value[k]] as const);
    sorted.forEach((k) => delete value[k]);
    copy.forEach(([k, v]) => (value as JsonObject)[k] = v);
  } else if (isArray(value)) {
    value.sort((a, b) => {
      if (sortByPath) {
        const valA = getValueAtPath(a, sortByPath);
        const valB = getValueAtPath(b, sortByPath);
        const strA = valA === null ? "" : String(valA);
        const strB = valB === null ? "" : String(valB);
        if (mode === "a-z") return strA.localeCompare(strB);
        if (mode === "z-a") return strB.localeCompare(strA);
        const na = parseFloat(strA);
        const nb = parseFloat(strB);
        if (!isNaN(na) && !isNaN(nb)) {
          return mode === "num-asc" ? na - nb : nb - na;
        }
        return strA.localeCompare(strB);
      }
      if (mode === "a-z") return JSON.stringify(a).localeCompare(JSON.stringify(b));
      if (mode === "z-a") return JSON.stringify(b).localeCompare(JSON.stringify(a));
      const na = typeof a === "number" ? a : parseFloat(String(a));
      const nb = typeof b === "number" ? b : parseFloat(String(b));
      if (!isNaN(na) && !isNaN(nb)) {
        return mode === "num-asc" ? na - nb : nb - na;
      }
      return JSON.stringify(a).localeCompare(JSON.stringify(b));
    });
  }
}

function validateJsonValue(val: unknown, path: string): string[] {
  const errs: string[] = [];
  if (val === undefined) {
    errs.push(`${path}: undefined not allowed`);
    return errs;
  }
  if (typeof val === "string") {
    if (/[\x00-\x1f]/.test(val)) errs.push(`${path}: control characters in string`);
    return errs;
  }
  if (Array.isArray(val)) {
    val.forEach((v, i) => errs.push(...validateJsonValue(v, `${path}[${i}]`)));
    return errs;
  }
  if (val !== null && typeof val === "object") {
    for (const k of Object.keys(val)) {
      if (!/^[a-zA-Z0-9_-]+$/.test(k)) errs.push(`${path}.${k}: invalid key chars`);
      errs.push(...validateJsonValue((val as JsonObject)[k], `${path}.${k}`));
    }
  }
  return errs;
}

interface TreeNodeProps {
  path: string;
  keyName: string;
  value: JsonValue;
  parent: JsonObject | JsonArray;
  parentKey: string | number;
  onUpdate: () => void;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onContextMenuOpen: (path: string, value: JsonObject | JsonArray, e: React.MouseEvent, parent?: JsonObject | JsonArray, keyName?: string, sortByKey?: string, grandparent?: JsonObject | JsonArray) => void;
  depth?: number;
  ancestors?: Array<{ obj: JsonObject | JsonArray; keyName: string }>;
  collapsedPaths: Set<string>;
  toggleCollapse: (path: string) => void;
  protectedPaths?: string[];
  lineNumber: number;
  isLast?: boolean;
}

function TreeNode({ path, keyName, value, parent, parentKey, onUpdate, selectedPath, onSelect, onContextMenuOpen, depth = 0, ancestors = [], collapsedPaths, toggleCollapse, protectedPaths = [], lineNumber, isLast = false }: TreeNodeProps) {
  const [dragOver, setDragOver] = useState(false);
  const [dragging, setDragging] = useState(false);
  const isArrayParent = Array.isArray(parent);
  const idx = typeof parentKey === "number" ? parentKey : -1;

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      if (!isArrayParent) return;
      e.dataTransfer.setData("application/json-path", path);
      e.dataTransfer.effectAllowed = "move";
      setDragging(true);
    },
    [path, isArrayParent]
  );

  const handleDragEnd = useCallback(() => setDragging(false), []);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!isArrayParent) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOver(true);
    },
    [isArrayParent]
  );

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!isArrayParent) return;
      e.preventDefault();
      setDragOver(false);
      const srcPath = e.dataTransfer.getData("application/json-path");
      if (!srcPath || srcPath === path) return;
      const srcParts = srcPath.split(".");
      const srcParentPath = srcParts.slice(0, -1).join(".");
      const srcIdx = parseInt(srcParts[srcParts.length - 1], 10);
      if (isNaN(srcIdx)) return;
      const tgtParts = path.split(".");
      const tgtParentPath = tgtParts.slice(0, -1).join(".");
      const tgtIdx = parseInt(tgtParts[tgtParts.length - 1], 10);
      if (srcParentPath !== tgtParentPath || isNaN(tgtIdx)) return;
      const arr = parent as JsonArray;
      const item = arr[srcIdx];
      arr.splice(srcIdx, 1);
      const newIdx = srcIdx < tgtIdx ? tgtIdx - 1 : tgtIdx;
      arr.splice(newIdx, 0, item);
      onUpdate();
    },
    [path, parent, isArrayParent, onUpdate]
  );

  const moveUp = useCallback(() => {
    if (!isArrayParent || idx <= 0) return;
    const arr = parent as JsonArray;
    [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
    onUpdate();
  }, [parent, idx, isArrayParent, onUpdate]);

  const moveDown = useCallback(() => {
    if (!isArrayParent || idx >= (parent as JsonArray).length - 1) return;
    const arr = parent as JsonArray;
    [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
    onUpdate();
  }, [parent, idx, isArrayParent, onUpdate]);

  const deleteNode = useCallback(() => {
    if (Array.isArray(parent)) {
      (parent as JsonArray).splice(idx, 1);
    } else {
      delete (parent as JsonObject)[keyName];
    }
    onUpdate();
  }, [parent, keyName, idx, onUpdate]);

  const sortAlpha = useCallback(() => {
    // Check if this element is protected
    if (protectedPaths.includes(keyName)) {
      alert(`"${keyName}" is protected and cannot be sorted`);
      return;
    }

    if (isObject(value)) {
      const keys = Object.keys(value).sort();
      const sorted: JsonObject = {};
      keys.forEach((k) => (sorted[k] = value[k]));
      Object.keys(value).forEach((k) => delete value[k]);
      Object.assign(value, sorted);
      onUpdate();
    }
    if (isArray(value)) {
      value.sort((a, b) => {
        const sa = JSON.stringify(a);
        const sb = JSON.stringify(b);
        return sa.localeCompare(sb);
      });
      onUpdate();
    }
  }, [value, onUpdate, keyName, protectedPaths]);

  const addChild = useCallback(() => {
    if (isObject(value)) {
      (value as JsonObject)["newKey"] = "";
      onUpdate();
    }
    if (isArray(value)) {
      (value as JsonArray).push("");
      onUpdate();
    }
  }, [value, onUpdate]);

  // Add pagination state
  const [visibleItems, setVisibleItems] = useState(Number.MAX_SAFE_INTEGER);

  if (isObject(value) || isArray(value)) {
    const allKeys = isArray(value) ? value.map((_, i) => String(i)) : Object.keys(value);

    // Use pagination only for arrays larger than 100 items
    const isLargeArray = isArray(value) && allKeys.length > 100;
    const keysToShow = isLargeArray ? allKeys.slice(0, visibleItems) : allKeys;
    const remainingCount = allKeys.length - visibleItems;

    const isObj = isObject(value);
    const isSelected = selectedPath === path;
    const isCollapsed = collapsedPaths.has(path);
    return (
      <div className={`tree-node ${depth === 0 ? "tree-node-root" : ""}`}>
        <div
          className={`tree-key ${dragging ? "dragging" : ""} ${dragOver ? "drag-over" : ""} ${isSelected ? "selected" : ""}`}
          draggable={isArrayParent}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => onSelect(path)}
          style={{ paddingLeft: `calc(45px + ${depth} * 2ch)`, position: "relative", height: "20px", display: "flex", alignItems: "center" }}
          onContextMenu={(e) => { e.preventDefault(); onSelect(path); onContextMenuOpen(path, value as JsonObject | JsonArray, e, parent, keyName, undefined); }}
        >
          <span className="line-number" style={{ position: "absolute", left: 0, top: 0, width: "35px", fontSize: "13px", fontFamily: "monospace", color: "#555", textAlign: "right", paddingRight: "5px", borderRight: "1px solid #333", userSelect: "none", height: "100%" }}>{lineNumber}</span>
          <span
            onClick={(e) => { e.stopPropagation(); toggleCollapse(path); }}
            style={{ cursor: "pointer", marginRight: "4px", userSelect: "none", display: "inline-block", width: "12px", fontSize: "10px" }}
            title={isCollapsed ? "Expand" : "Collapse"}
          >
            {isCollapsed ? "▶" : "▼"}
          </span>
          <span className="line-number" style={{ position: "absolute", left: 0, top: 0, width: "35px", fontSize: "13px", fontFamily: "monospace", color: "#555", textAlign: "right", paddingRight: "5px", borderRight: "1px solid #333", userSelect: "none", height: "100%" }}>{lineNumber}</span>
          {!isArrayParent && <span className="key-name">{JSON.stringify(keyName)}:</span>}
          <span className="key-value">{isObj ? "{" : "["}{isCollapsed ? `...${allKeys.length}${isObj ? "}" : "]"}${!isLast ? "," : ""}` : ""}</span>
          <span className="tree-actions" style={{ position: "absolute", right: 0, top: 0, height: "100%", display: "flex", alignItems: "center", gap: "2px", opacity: 0, transition: "opacity 0.2s", background: "#000", paddingLeft: "5px" }}>
            {isArrayParent && (
              <>
                <button onClick={moveUp} disabled={idx <= 0} title="Move up" style={{ height: "16px", width: "16px", padding: 0, fontSize: "10px", lineHeight: "14px", display: "flex", alignItems: "center", justifyContent: "center", background: "#222", border: "1px solid #444", color: "#fff", cursor: "pointer" }}>↑</button>
                <button onClick={moveDown} disabled={idx >= (parent as JsonArray).length - 1} title="Move down" style={{ height: "16px", width: "16px", padding: 0, fontSize: "10px", lineHeight: "14px", display: "flex", alignItems: "center", justifyContent: "center", background: "#222", border: "1px solid #444", color: "#fff", cursor: "pointer" }}>↓</button>
              </>
            )}
            <button onClick={sortAlpha} title="Sort A-Z" style={{ height: "16px", width: "16px", padding: 0, fontSize: "10px", lineHeight: "14px", display: "flex", alignItems: "center", justifyContent: "center", background: "#222", border: "1px solid #444", color: "#fff", cursor: "pointer" }}>⇅</button>
            <button onClick={addChild} title="Add child" style={{ height: "16px", width: "16px", padding: 0, fontSize: "10px", lineHeight: "14px", display: "flex", alignItems: "center", justifyContent: "center", background: "#222", border: "1px solid #444", color: "#fff", cursor: "pointer" }}>+</button>
            <button onClick={deleteNode} title="Delete" style={{ height: "16px", width: "16px", padding: 0, fontSize: "10px", lineHeight: "14px", display: "flex", alignItems: "center", justifyContent: "center", background: "#222", border: "1px solid #444", color: "#fff", cursor: "pointer" }}>×</button>
          </span>
        </div>
        {!isCollapsed && (() => {
          let currentLine = lineNumber + 1;
          return keysToShow.map((k, i) => {
            const val = (value as Record<string, JsonValue>)[k];
            const childLine = currentLine;
            currentLine += getJsonLineCount(val);
            return (
              <TreeNode
                key={isArray(value) ? `${k}-${i}` : k}
                path={isArray(value) ? `${path}.${k}` : path ? `${path}.${k}` : k}
                keyName={k}
                value={val}
                parent={value as JsonObject | JsonArray}
                parentKey={isArray(value) ? parseInt(k, 10) : k}
                onUpdate={onUpdate}
                selectedPath={selectedPath}
                onSelect={onSelect}
                onContextMenuOpen={onContextMenuOpen}
                depth={depth + 1}
                ancestors={[...ancestors, { obj: value as JsonObject | JsonArray, keyName }]}
                collapsedPaths={collapsedPaths}
                toggleCollapse={toggleCollapse}
                protectedPaths={protectedPaths}
                lineNumber={childLine}
                isLast={i === keysToShow.length - 1}
              />
            );
          });
        })()}
        {!isCollapsed && isLargeArray && remainingCount > 0 && (
          <div style={{ paddingLeft: `calc(45px + ${depth} * 2ch + 2ch)`, height: "20px", display: "flex", alignItems: "center", fontStyle: "italic", color: "#888" }}>
            ... {remainingCount} more items ...
            <button
              onClick={(e) => { e.stopPropagation(); setVisibleItems(prev => prev + 100); }}
              style={{ marginLeft: "10px", padding: "2px 8px", fontSize: "12px", background: "#333", border: "1px solid #666", color: "white", borderRadius: "4px", cursor: "pointer" }}
            >
              Show 100 more
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setVisibleItems(prev => prev + 1000); }}
              style={{ marginLeft: "10px", padding: "2px 8px", fontSize: "12px", background: "#333", border: "1px solid #666", color: "white", borderRadius: "4px", cursor: "pointer" }}
            >
              Show 1000 more
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setVisibleItems(allKeys.length); }}
              style={{ marginLeft: "10px", padding: "2px 8px", fontSize: "12px", background: "#333", border: "1px solid #666", color: "white", borderRadius: "4px", cursor: "pointer" }}
            >
              Show All (Careful!)
            </button>
          </div>
        )}
        {!isCollapsed && <div style={{ paddingLeft: `calc(45px + ${depth} * 2ch)`, height: "20px", display: "flex", alignItems: "center" }}>
          <span className="key-value">{isObj ? "}" : "]"}{!isLast ? "," : ""}</span>
        </div>}
        {isCollapsed && <span className="key-value" style={{ marginLeft: "4px" }}></span>}
      </div>
    );
  }

  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(JSON.stringify(value));

  const commitEdit = useCallback(() => {
    setEditing(false);
    try {
      const parsed = JSON.parse(editVal);
      if (Array.isArray(parent)) {
        (parent as JsonArray)[idx] = parsed;
      } else {
        (parent as JsonObject)[keyName] = parsed;
      }
      onUpdate();
    } catch {
      setEditVal(JSON.stringify(value));
    }
  }, [editVal, parent, keyName, idx, onUpdate, value]);

  return (
    <div className="tree-node">
      <div
        className="tree-key"
        onClick={() => onSelect(path)}
        onContextMenu={(e) => {
          e.preventDefault();
          onSelect(path);
          if (ancestors.length >= 3) {
            const sortContainer = ancestors[ancestors.length - 3].obj;
            const pathParts = [ancestors[ancestors.length - 1].keyName, keyName];
            const fullPath = pathParts.join(".");
            const containerName = ancestors[ancestors.length - 3].keyName;
            console.log("Primitive sort:", { containerName, fullPath, ancestors: ancestors.map(a => a.keyName), sortContainer });
            onContextMenuOpen(path, sortContainer, e, undefined, containerName, fullPath);
          }
        }}
      >

        <span className="line-number" style={{ position: "absolute", left: 0, top: 0, width: "35px", fontSize: "13px", fontFamily: "monospace", color: "#555", textAlign: "right", paddingRight: "5px", borderRight: "1px solid #333", userSelect: "none", height: "100%" }}>{lineNumber}</span>
        {!isArrayParent && <span className="key-name">{JSON.stringify(keyName)}:</span>}
        {editing ? (
          <input
            autoFocus
            value={editVal}
            onChange={(e) => setEditVal(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => e.key === "Enter" && commitEdit()}
            style={{ flex: 1, marginLeft: 4, background: "var(--surface)", color: "inherit", border: "1px solid var(--accent)" }}
          />
        ) : (
          <span
            className="key-value"
            onDoubleClick={() => { setEditVal(JSON.stringify(value)); setEditing(true); }}
          >
            {JSON.stringify(value)}
          </span>
        )}
        <span className="comma" style={{ color: "#fff" }}>{!isLast ? "," : ""}</span>
        <span className="tree-actions" style={{ position: "absolute", right: 0, top: 0, height: "100%", display: "flex", alignItems: "center", gap: "2px", opacity: 0, transition: "opacity 0.2s", background: "#000", paddingLeft: "5px" }}>
          <button onClick={deleteNode} title="Delete" style={{ height: "16px", width: "16px", padding: 0, fontSize: "10px", lineHeight: "14px", display: "flex", alignItems: "center", justifyContent: "center", background: "#222", border: "1px solid #444", color: "#fff", cursor: "pointer" }}>×</button>
        </span>
      </div>
    </div>
  );
}

export default function JsonEditor({
  data,
  onChange,
  sortMode = "by-key",
  sortByPath = "",
  protectedPaths = [],
}: {
  data: Record<string, unknown> | null;
  onChange: (d: Record<string, unknown>) => void;
  sortMode?: "by-key" | "by-value";
  sortByPath?: string;
  protectedPaths?: string[];
}) {
  const dataRef = useRef(data);
  dataRef.current = data;
  const triggerUpdate = useCallback(() => {
    onChange(JSON.parse(JSON.stringify(dataRef.current)) as Record<string, unknown>);
  }, [onChange]);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; keyName: string; sortByKey?: string } | null>(null);
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());
  const sortTargetRef = useRef<JsonObject | JsonArray | null>(null);
  const sortAllTargetsRef = useRef<Array<JsonObject | JsonArray>>([]);
  const sortByKeyRef = useRef<string>("");

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => { sortTargetRef.current = null; sortAllTargetsRef.current = []; sortByKeyRef.current = ""; setContextMenu(null); };
    const t = setTimeout(() => window.addEventListener("click", close), 0);
    return () => { clearTimeout(t); window.removeEventListener("click", close); };
  }, [contextMenu]);

  const findAllByKey = useCallback((root: JsonValue, targetKey: string): Array<JsonObject | JsonArray> => {
    const results: Array<JsonObject | JsonArray> = [];
    const traverse = (val: JsonValue) => {
      if (isObject(val)) {
        for (const k of Object.keys(val)) {
          if (k === targetKey && (isObject(val[k]) || isArray(val[k]))) {
            results.push(val[k] as JsonObject | JsonArray);
          }
          traverse(val[k]);
        }
      } else if (isArray(val)) {
        val.forEach((v) => traverse(v));
      }
    };
    traverse(root);
    return results;
  }, []);

  const handleContextMenuOpen = useCallback((path: string, value: JsonObject | JsonArray, e: React.MouseEvent, parent?: JsonObject | JsonArray, keyName?: string, sortByKey?: string, grandparent?: JsonObject | JsonArray) => {
    setSelectedPath(path);
    sortTargetRef.current = value;
    sortByKeyRef.current = sortByKey || "";
    if (keyName && dataRef.current) {
      sortAllTargetsRef.current = findAllByKey(dataRef.current as JsonValue, keyName);
    } else {
      sortAllTargetsRef.current = [];
    }
    setContextMenu({ x: e.clientX, y: e.clientY, keyName: keyName || "", sortByKey });
  }, [findAllByKey]);

  const handleSort = useCallback((mode: SortMode, sortAll: boolean = false, keyName?: string) => {
    // Check if this element is protected
    if (keyName && protectedPaths.includes(keyName)) {
      alert(`"${keyName}" is protected and cannot be sorted`);
      setContextMenu(null);
      return;
    }

    const path = sortByKeyRef.current || (sortMode === "by-value" ? sortByPath : undefined);
    if (sortAll && sortAllTargetsRef.current.length > 0) {
      sortAllTargetsRef.current.forEach((target) => sortAtLevel(target, mode, path));
      sortAllTargetsRef.current = [];
    } else {
      const target = sortTargetRef.current;
      if (target) {
        sortAtLevel(target, mode, path);
        sortTargetRef.current = null;
      }
    }
    sortByKeyRef.current = "";
    triggerUpdate();
    setContextMenu(null);
  }, [triggerUpdate, sortMode, sortByPath, protectedPaths]);

  const toggleCollapse = useCallback((path: string) => {
    setCollapsedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  if (!data) return null;

  const dataObj = data as JsonObject;
  const keys = Object.keys(dataObj);

  const collapseAll = useCallback(() => {
    const allPaths = new Set<string>();
    const collectPaths = (obj: JsonValue, path: string = "") => {
      if (isObject(obj) || isArray(obj)) {
        if (path) allPaths.add(path);
        const items = isObject(obj) ? Object.entries(obj) : (obj as JsonArray).map((v, i) => [String(i), v] as const);
        items.forEach(([k, v]) => {
          const newPath = path ? `${path}.${k}` : k;
          collectPaths(v, newPath);
        });
      }
    };
    collectPaths(dataObj);
    setCollapsedPaths(allPaths);
  }, [dataObj]);

  const expandAll = useCallback(() => {
    setCollapsedPaths(new Set());
  }, []);

  return (
    <div>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", padding: "0.5rem", background: "rgba(0,0,0,0.2)", borderRadius: "4px" }}>
        <button onClick={collapseAll} style={{ padding: "0.3rem 0.6rem", fontSize: "12px", cursor: "pointer" }}>
          ▶ Collapse All
        </button>
        <button onClick={expandAll} style={{ padding: "0.3rem 0.6rem", fontSize: "12px", cursor: "pointer" }}>
          ▼ Expand All
        </button>
      </div>
      <div className="tree-node tree-node-root">
        <div className="key-value" style={{ height: "20px", paddingLeft: "45px", display: "flex", alignItems: "center" }}>{"{"}</div>
        {(() => {
          let currentLine = 2; // Line 1 is "{"
          return keys.map((k, i) => {
            const val = dataObj[k];
            const childLine = currentLine;
            currentLine += getJsonLineCount(val);
            return (
              <TreeNode
                key={k}
                path={k}
                keyName={k}
                value={val}
                parent={dataObj}
                parentKey={k}
                onUpdate={triggerUpdate}
                selectedPath={selectedPath}
                onSelect={setSelectedPath}
                onContextMenuOpen={handleContextMenuOpen}
                depth={0}
                collapsedPaths={collapsedPaths}
                toggleCollapse={toggleCollapse}
                protectedPaths={protectedPaths}
                lineNumber={childLine}
                isLast={i === keys.length - 1}
              />
            );
          });
        })()}
        <div className="key-value" style={{ height: "20px", paddingLeft: "45px", display: "flex", alignItems: "center" }}>{"}"}</div>
      </div>
      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleSort("a-z", false, contextMenu.keyName); }}>
            Sort {contextMenu.keyName || "element"} by {contextMenu.sortByKey || (sortMode === "by-value" && sortByPath ? sortByPath : "name")} A-Z
          </button>
          {sortAllTargetsRef.current.length > 1 && (
            <button type="button" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleSort("a-z", true, contextMenu.keyName); }}>
              Sort all {contextMenu.keyName}s by {contextMenu.sortByKey || (sortMode === "by-value" && sortByPath ? sortByPath : "name")} A-Z ({sortAllTargetsRef.current.length})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
