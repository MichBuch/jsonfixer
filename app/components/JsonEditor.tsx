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

function sortAtLevel(value: JsonObject | JsonArray, mode: SortMode): void {
  if (isObject(value)) {
    const keys = Object.keys(value);
    const sorted = keys.sort((a, b) => {
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
  onContextMenuOpen: (path: string, value: JsonObject | JsonArray, e: React.MouseEvent, parent?: JsonObject | JsonArray) => void;
  depth?: number;
}

function TreeNode({ path, keyName, value, parent, parentKey, onUpdate, selectedPath, onSelect, onContextMenuOpen, depth = 0 }: TreeNodeProps) {
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
          onContextMenu={(e) => { e.preventDefault(); onSelect(path); onContextMenuOpen(path, value as JsonObject | JsonArray, e, parent); }}
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
      <div className="tree-key">
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
}: {
  data: Record<string, unknown> | null;
  onChange: (d: Record<string, unknown>) => void;
}) {
  const dataRef = useRef(data);
  dataRef.current = data;
  const triggerUpdate = useCallback(() => {
    onChange(JSON.parse(JSON.stringify(dataRef.current)) as Record<string, unknown>);
  }, [onChange]);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const sortTargetRef = useRef<JsonObject | JsonArray | null>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => { sortTargetRef.current = null; setContextMenu(null); };
    const t = setTimeout(() => window.addEventListener("click", close), 0);
    return () => { clearTimeout(t); window.removeEventListener("click", close); };
  }, [contextMenu]);

  const handleContextMenuOpen = useCallback((path: string, value: JsonObject | JsonArray, e: React.MouseEvent, parent?: JsonObject | JsonArray) => {
    setSelectedPath(path);
    sortTargetRef.current = parent || value;
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleSort = useCallback((mode: SortMode) => {
    const target = sortTargetRef.current;
    if (target) {
      sortAtLevel(target, mode);
      sortTargetRef.current = null;
      triggerUpdate();
    }
    setContextMenu(null);
  }, [triggerUpdate]);

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
          <button type="button" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleSort("a-z"); }}>Sort A-Z</button>
        </div>
      )}
    </div>
  );
}
