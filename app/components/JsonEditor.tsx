"use client";

import { useState, useCallback, useEffect, useRef } from "react";

type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];

type SortMode = "a-z" | "z-a" | "num-asc" | "num-desc";

function isObject(v: JsonValue): v is JsonObject {
  return v !== null && typeof v === "object" && !Array.isArray(v);
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
}

function TreeNode({ path, keyName, value, parent, parentKey, onUpdate, selectedPath, onSelect, onContextMenuOpen, depth = 0, ancestors = [] }: TreeNodeProps) {
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
  }, [value, onUpdate]);

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

  if (isObject(value) || isArray(value)) {
    const keys = isArray(value) ? value.map((_, i) => String(i)) : Object.keys(value);
    const isObj = isObject(value);
    const isSelected = selectedPath === path;
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
          onContextMenu={(e) => { e.preventDefault(); onSelect(path); onContextMenuOpen(path, value as JsonObject | JsonArray, e, parent, keyName, undefined); }}
        >
          {!isArrayParent && <span className="key-name">{JSON.stringify(keyName)}:</span>}
          <span className="key-value">{isObj ? "{" : "["}</span>
          <span className="tree-actions">
            {isArrayParent && (
              <>
                <button onClick={moveUp} disabled={idx <= 0} title="Move up">↑</button>
                <button onClick={moveDown} disabled={idx >= (parent as JsonArray).length - 1} title="Move down">↓</button>
              </>
            )}
            <button onClick={sortAlpha} title="Sort A-Z">⇅</button>
            <button onClick={addChild} title="Add child">+</button>
            <button onClick={deleteNode} title="Delete">×</button>
          </span>
        </div>
        {keys.map((k, i) => (
          <TreeNode
            key={isArray(value) ? `${k}-${i}` : k}
            path={isArray(value) ? `${path}.${k}` : path ? `${path}.${k}` : k}
            keyName={k}
            value={(value as Record<string, JsonValue>)[k]}
            parent={value as JsonObject | JsonArray}
            parentKey={isArray(value) ? parseInt(k, 10) : k}
            onUpdate={onUpdate}
            selectedPath={selectedPath}
            onSelect={onSelect}
            onContextMenuOpen={onContextMenuOpen}
            depth={depth + 1}
            ancestors={[...ancestors, { obj: value as JsonObject | JsonArray, keyName }]}
          />
        ))}
        <div style={{ marginLeft: "1rem" }}>
          <span className="key-value">{isObj ? "}" : "]"}</span>
        </div>
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
          if (ancestors.length > 0) {
            const sortContainer = ancestors[ancestors.length - 1].obj;
            const pathParts = ancestors.slice(1).map(a => a.keyName);
            pathParts.push(keyName);
            const fullPath = pathParts.join(".");
            onContextMenuOpen(path, sortContainer, e, undefined, keyName, fullPath);
          }
        }}
      >
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
        <span className="tree-actions">
          <button onClick={deleteNode} title="Delete">×</button>
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
}: {
  data: Record<string, unknown> | null;
  onChange: (d: Record<string, unknown>) => void;
  sortMode?: "by-key" | "by-value";
  sortByPath?: string;
}) {
  const dataRef = useRef(data);
  dataRef.current = data;
  const triggerUpdate = useCallback(() => {
    onChange(JSON.parse(JSON.stringify(dataRef.current)) as Record<string, unknown>);
  }, [onChange]);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; keyName: string; sortByKey?: string } | null>(null);
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

  const handleSort = useCallback((mode: SortMode, sortAll: boolean = false) => {
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
  }, [triggerUpdate, sortMode, sortByPath]);

  if (!data) return null;

  const dataObj = data as JsonObject;
  const keys = Object.keys(dataObj);
  return (
    <div>
      <div className="tree-node tree-node-root">
        <div className="key-value">{"{"}</div>
        {keys.map((k) => (
          <TreeNode
            key={k}
            path={k}
            keyName={k}
            value={dataObj[k] as JsonValue}
            parent={dataObj}
            parentKey={k}
            onUpdate={triggerUpdate}
            selectedPath={selectedPath}
            onSelect={setSelectedPath}
            onContextMenuOpen={handleContextMenuOpen}
            depth={0}
          />
        ))}
        <div className="key-value">{"}"}</div>
      </div>
      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleSort("a-z", false); }}>
            Sort {contextMenu.keyName || "element"} by {contextMenu.sortByKey || (sortMode === "by-value" && sortByPath ? sortByPath : "name")} A-Z
          </button>
          {sortAllTargetsRef.current.length > 1 && (
            <button type="button" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleSort("a-z", true); }}>
              Sort all {contextMenu.keyName}s by {contextMenu.sortByKey || (sortMode === "by-value" && sortByPath ? sortByPath : "name")} A-Z ({sortAllTargetsRef.current.length})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
