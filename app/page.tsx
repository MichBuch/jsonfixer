"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import JsonEditor from "./components/JsonEditor";
import { fruitCatalog, vehicleInventory } from "./test-data";
import {
  analyzeJsonStructure,
  getSortableContainers,
  getAllPaths,
  evaluatePath,
  getFieldValue,
  isPathProtected,
  type ContainerInfo,
  type StructureAnalysis
} from "./utils/pathAnalyzer";

type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];

export default function Home() {
  const [sourceFileName, setSourceFileName] = useState<string>("");
  const [sourceData, setSourceData] = useState<JsonObject | null>(null);
  const [editedData, setEditedData] = useState<JsonObject | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [validation, setValidation] = useState<{ ok: boolean; msg: string } | null>(null);
  const [sortMode, setSortMode] = useState<"by-key" | "by-value">("by-key");
  const [sortByPath, setSortByPath] = useState<string>("");
  const [sortContainer, setSortContainer] = useState<string>("");
  const [sortValuePath, setSortValuePath] = useState<string>("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [lastSort, setLastSort] = useState<string>("");
  const [protectedPaths, setProtectedPaths] = useState<Set<string>>(new Set([]));  // Start with no protections - user can add as needed
  const [undoHistory, setUndoHistory] = useState<any[]>([]);  // History for undo functionality
  const [jsonError, setJsonError] = useState<{ error: string; raw: string; suggestions: string[] } | null>(null);
  const [leftPaneWidth, setLeftPaneWidth] = useState<number>(50); // percentage
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const [structureAnalysis, setStructureAnalysis] = useState<StructureAnalysis | null>(null);
  const [containerOptions, setContainerOptions] = useState<ContainerInfo[]>([]);
  const [protectedContainers, setProtectedContainers] = useState<ContainerInfo[]>([]);  // All containers for protection
  const [sortFieldOptions, setSortFieldOptions] = useState<string[]>([]);

  const protectedDropdownRef = useRef<HTMLDetailsElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (protectedDropdownRef.current && !protectedDropdownRef.current.contains(e.target as Node)) {
        protectedDropdownRef.current.open = false;
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const container = document.querySelector('.panes') as HTMLElement;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const newWidth = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftPaneWidth(Math.min(Math.max(newWidth, 20), 80));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.classList.remove('resizing');
    };

    if (isResizing) {
      document.body.classList.add('resizing');
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.body.classList.remove('resizing');
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing]);

  const handleMouseDown = useCallback(() => {
    setIsResizing(true);
  }, []);

  // Analyze JSON structure whenever data changes
  useEffect(() => {
    if (editedData) {
      const analysis = analyzeJsonStructure(editedData as any);
      setStructureAnalysis(analysis);
      const containers = getSortableContainers(analysis);

      // Build full sort paths: container + field combinations
      const fullSortPaths: ContainerInfo[] = [];
      const allContainers: ContainerInfo[] = [];

      containers.forEach(container => {
        // Skip array index paths
        if (container.path.includes('[')) return;

        // Add ALL containers to the protection list
        allContainers.push(container);

        if (container.type === 'array' && container.availableFields) {
          // For arrays, create paths like "view.classes.name", "view.classes.type"
          container.availableFields.forEach(field => {
            fullSortPaths.push({
              ...container,
              path: `${container.path}.${field}`,
              availableFields: [field] // Store the field for later extraction
            });
          });
        } else if (container.type === 'object') {
          // For objects, just the path itself (sorts by keys)
          fullSortPaths.push(container);
        }
      });

      setContainerOptions(fullSortPaths);
      setProtectedContainers(allContainers);

      // For the protected dropdown, show ALL discovered paths
      const allPaths = getAllPaths(analysis).map(path => ({
        path,
        type: 'object' as const,
        depth: 0,
        itemCount: 0
      }));
      setProtectedContainers(allPaths);

      setSortFieldOptions([]);
    } else {
      setStructureAnalysis(null);
      setContainerOptions([]);
      setProtectedContainers([]);
      setSortFieldOptions([]);
    }
  }, [editedData]);

  const loadTestFile = (type: "fruit" | "cars") => {
    const data = type === "fruit" ? fruitCatalog : vehicleInventory;
    const mutableData = JSON.parse(JSON.stringify(data));
    setSourceFileName(`test-${type}.json`);
    setSourceData(mutableData);
    setEditedData(JSON.parse(JSON.stringify(data)));
    setLoadError(null);
    setValidation(null);
    setJsonError(null);
  };

  const handleFileLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSourceFileName(file.name);
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const json = JSON.parse(text);
        setSourceData(json);
        setEditedData(JSON.parse(JSON.stringify(json)));
        setLoadError(null);
        setValidation(null);
        setJsonError(null);
      } catch (err: any) {
        setLoadError(err.message || String(err));
        setJsonError({
          error: err.message,
          raw: event.target?.result as string,
          suggestions: []
        });
      }
    };

    reader.onerror = () => {
      setLoadError("Failed to read file");
    };

    reader.readAsText(file);
  };

  const validate = () => {
    if (!editedData) {
      setValidation({ ok: false, msg: "No data loaded" });
      return;
    }
    try {
      JSON.stringify(editedData);
      setValidation({ ok: true, msg: "✓ Valid JSON" });
    } catch (e: any) {
      setValidation({ ok: false, msg: `✗ Invalid: ${e.message}` });
    }
  };

  const saveCopy = () => {
    if (!editedData || !sourceFileName) return;
    const baseName = sourceFileName.replace(/\.json$/i, "");
    const copy = `${baseName}_copy.json`;
    const blob = new Blob([JSON.stringify(editedData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = copy;
    a.click();
    URL.revokeObjectURL(url);
  };

  const syntaxHighlight = (json: string): string => {
    return json
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(
        /("(\\u[\dA-Fa-f]{4}|\\[^u]|[^"\\])*"(\s*:)?|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
        (match) => {
          let cls = "number";
          if (/^"/.test(match)) {
            cls = /:$/.test(match) ? "key" : "string";
          } else if (/true|false/.test(match)) {
            cls = "boolean";
          } else if (/null/.test(match)) {
            cls = "null";
          }
          return `<span class="${cls}">${match}</span>`;
        }
      );
  };

  return (
    <div className="app">
      <div className="toolbar">
        <label>
          Load JSON file
          <input type="file" accept=".json" onChange={handleFileLoad} />
        </label>
        <button onClick={() => loadTestFile("fruit")}>Load fruit test</button>
        <button onClick={() => loadTestFile("cars")}>Load cars test</button>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginLeft: "auto", flexWrap: "wrap" }}>
          <input
            type="text"
            list="container-paths"
            placeholder="Sort path (e.g. view.classes.name, view)"
            value={sortContainer}
            onChange={(e) => setSortContainer(e.target.value)}
            style={{ padding: "0.4rem", background: "#0a1929", color: "var(--text)", border: "1px solid #00ffff", borderRadius: "4px", minWidth: "120px" }}
          />
          <datalist id="container-paths">
            {containerOptions.map((c) => <option key={c.path} value={c.path} />)}
          </datalist>



          <details ref={protectedDropdownRef} style={{ position: "relative" }}>
            <summary style={{ padding: "0.4rem", background: "var(--border)", color: "var(--text)", border: "1px solid #00ffff", borderRadius: "4px", cursor: "pointer", listStyle: "none", userSelect: "none" }}>
              🔒 Protected ({protectedPaths.size})
            </summary>
            <div style={{ position: "absolute", top: "100%", right: 0, marginTop: "0.25rem", background: "var(--surface)", border: "1px solid #00ffff", borderRadius: "4px", padding: "0.5rem", minWidth: "470px", maxHeight: "300px", overflow: "auto", zIndex: 1000 }}>
              {[...protectedContainers.map((c) => c.path)].map((path) => (
                <label key={path} style={{ display: "block", padding: "0.25rem", cursor: "pointer", fontSize: "12px", border: "none" }}>
                  <input
                    type="checkbox"
                    checked={protectedPaths.has(path)}
                    onChange={(e) => {
                      const newSet = new Set(protectedPaths);
                      if (e.target.checked) newSet.add(path);
                      else newSet.delete(path);
                      setProtectedPaths(newSet);
                    }}
                    style={{ marginRight: "0.5rem", border: "none" }}
                  />
                  {path}
                </label>
              ))}
            </div>
          </details>

          <select value={sortMode} onChange={(e) => setSortMode(e.target.value as "by-key" | "by-value")} style={{ padding: "0.4rem", background: "var(--surface)", color: "var(--text)", border: "1px solid #00ffff", borderRadius: "4px" }}>
            <option value="by-key">By Name</option>
            <option value="by-value">By Value</option>
          </select>

          <select value={sortDirection} onChange={(e) => setSortDirection(e.target.value as "asc" | "desc")} style={{ padding: "0.4rem", background: "var(--surface)", color: "var(--text)", border: "1px solid #00ffff", borderRadius: "4px" }}>
            <option value="asc">A→Z</option>
            <option value="desc">Z→A</option>
          </select>
          <button
            onClick={() => {
              if (!editedData || !sortContainer) return;

              // Parse the full path to extract container and field
              // e.g. "view.classes.name" -> container: "view.classes", field: "name"
              let containerPath = sortContainer;
              let sortField = "";

              // Check if this is a full path (has availableFields set)
              const selectedOpt = containerOptions.find(c => c.path === sortContainer);
              if (selectedOpt?.availableFields?.length === 1) {
                sortField = selectedOpt.availableFields[0];
                const lastDotIndex = sortContainer.lastIndexOf('.');
                if (lastDotIndex > 0) containerPath = sortContainer.substring(0, lastDotIndex);
              }

              // Check if this path is protected
              if (isPathProtected(containerPath, Array.from(protectedPaths))) {
                alert(`"${containerPath}" is protected and cannot be sorted`);
                return;
              }

              // Use path evaluator to get the container
              const updated = JSON.parse(JSON.stringify(editedData));
              const container = evaluatePath(updated as any, containerPath);

              if (!container) {
                alert(`Container path "${sortContainer}" not found`);
                return;
              }

              // Sort the container
              if (Array.isArray(container)) {
                container.sort((a: any, b: any) => {
                  let valA: any = a;
                  let valB: any = b;

                  // Get values by field if specified
                  if (sortField) {
                    valA = getFieldValue(a, sortField);
                    valB = getFieldValue(b, sortField);
                  }

                  // Compare
                  const strA = String(valA ?? '');
                  const strB = String(valB ?? '');
                  const numA = parseFloat(strA);
                  const numB = parseFloat(strB);

                  if (!isNaN(numA) && !isNaN(numB)) {
                    return sortDirection === "asc" ? numA - numB : numB - numA;
                  }
                  return sortDirection === "asc" ? strA.localeCompare(strB) : strB.localeCompare(strA);
                });
                setEditedData(updated);
              } else if (typeof container === 'object' && container !== null) {
                // Sort object keys
                const keys = Object.keys(container).sort((a, b) =>
                  sortDirection === "asc" ? a.localeCompare(b) : b.localeCompare(a)
                );
                const sorted: any = {};
                keys.forEach(k => sorted[k] = container[k]);

                // Replace container in the data structure
                const parts = containerPath.split(/\.|\[/).map(p => p.replace(/\]$/, ''));
                let parent: any = updated;
                for (let i = 0; i < parts.length - 1; i++) {
                  parent = parent[parts[i]];
                }
                parent[parts[parts.length - 1]] = sorted;
                setEditedData(updated);
              }
            }}
            title="Sort using inputs above"
            style={{ padding: "0.4rem 0.8rem", fontWeight: "bold" }}
          >
            Sort
          </button>
          <button
            onClick={() => {
              if (undoHistory.length === 0) return;
              const previous = undoHistory[undoHistory.length - 1];
              setEditedData(JSON.parse(JSON.stringify(previous)));
              setUndoHistory(undoHistory.slice(0, -1));
            }}
            disabled={undoHistory.length === 0}
            title="Undo last change"
            style={{ padding: "0.4rem 0.8rem" }}
          >
            ↶ Undo
          </button>
        </div>
        <button onClick={validate}>Validate</button>
        <button onClick={saveCopy} disabled={!sourceFileName}>Save a copy</button>
        {validation && (
          <span className={validation.ok ? "validation-ok" : "validation-err"}>
            {validation.msg}
          </span>
        )}
        {loadError && <span className="validation-err">{loadError}</span>}
      </div>

      {editedData && sourceData && (
        <div className="panes">
          <div className="pane" style={{ width: `${leftPaneWidth}%` }}>
            <div className="pane-header">Source (read-only)</div>
            <div className="pane-content">
              <pre
                className="json-raw"
                dangerouslySetInnerHTML={{
                  __html: syntaxHighlight(JSON.stringify(sourceData, null, 2)),
                }}
              />
            </div>
          </div>
          <div
            className={`pane-resizer ${isResizing ? 'resizing' : ''}`}
            onMouseDown={handleMouseDown}
          />
          <div className="pane" style={{ width: `${100 - leftPaneWidth}%` }}>
            <div className="pane-header">Editor (drag, sort, collapse)</div>
            <div className="pane-content">
              <JsonEditor
                data={editedData as Record<string, unknown>}
                onChange={(updated) => setEditedData(updated as JsonObject)}
                sortMode={sortValuePath ? "by-value" : "by-key"}
                sortByPath={sortValuePath}
                protectedPaths={Array.from(protectedPaths)}
              />
            </div>
          </div>
        </div>
      )}

      {jsonError && (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
          <div style={{ padding: "1rem", background: "rgba(239, 68, 68, 0.15)", borderBottom: "2px solid #ef4444", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong>JSON Parse Error:</strong> {jsonError.error}
            </div>
            <button onClick={() => setJsonError(null)} style={{ padding: "0.5rem 1rem" }}>✕ Close</button>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "1rem" }}>
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: "13px" }}>
              {jsonError.raw}
            </pre>
          </div>
        </div>
      )}

      {!editedData && !jsonError && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>
          Load a JSON file to begin editing
        </div>
      )}
    </div>
  );
}


