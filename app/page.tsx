"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import JsonEditor from "./components/JsonEditor";
import LoadingOverlay from "./components/LoadingOverlay";
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
import { generateLargeTestData } from "./utils/testDataGenerator";

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
  const [isSorting, setIsSorting] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisSkipped, setAnalysisSkipped] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isFileLoading, setIsFileLoading] = useState<boolean>(false);
  const [manualSortField, setManualSortField] = useState<string>("");
  const workerRef = useRef<Worker | null>(null);
  const protectedDropdownRef = useRef<HTMLDetailsElement>(null);

  // Initialize Worker
  useEffect(() => {
    workerRef.current = new Worker('/worker.js');

    workerRef.current.onmessage = (e) => {
      const { type, success, result, itemCount, error } = e.data;

      if (success) {
        if (type === 'ANALYZE_RESULT') {
          setStructureAnalysis(result.structureAnalysis);
          setContainerOptions(result.containerOptions);
          setProtectedContainers(result.protectedContainers);
          setSortFieldOptions([]);
          setIsAnalyzing(false);
        } else if (type === 'SORT_RESULT') {
          // Save to undo history before applying change (we access current state via callback or ref if needed, 
          // but here we might rely on the closure or external ref if accessing editedData directly is stale. 
          // Actually, React state updates in callbacks can be tricky with stale closures.)
          // However, for now, specific sort logic update:

          setEditedData(result);
          setIsSorting(false);
          console.log(`✓ Sort complete: ${itemCount} items sorted at ${new Date().toLocaleTimeString()}`);
        }
      } else {
        console.error(error);
        alert(type === 'SORT_RESULT' ? 'Sort failed: ' + error : 'Analysis failed: ' + error);
        setIsSorting(false);
        setIsAnalyzing(false);
      }
    };

    workerRef.current.onerror = (err) => {
      console.error(err);
      setIsSorting(false);
      setIsAnalyzing(false);
    };

    return () => {
      workerRef.current?.terminate();
    };
  }, []); // Empty dependency array = run once on mount



  // Analyze JSON structure whenever data changes
  useEffect(() => {
    if (editedData && workerRef.current) {
      const jsonString = JSON.stringify(editedData);

      // Skip auto-analysis for files larger than 5MB to prevent hang
      // Approximate check: 1 char ~= 1 byte. 5MB = 5_000_000 chars.
      if (jsonString.length > 5 * 1024 * 1024) {
        console.log("Large file detected. Skipping auto-analysis.");
        setAnalysisSkipped(true);
        setStructureAnalysis(null); // Clear previous analysis
        return;
      }

      setAnalysisSkipped(false);
      setIsAnalyzing(true);
      workerRef.current.postMessage({ type: 'ANALYZE', data: editedData });
    } else {
      setStructureAnalysis(null);
      setContainerOptions([]);
      setProtectedContainers([]);
      setSortFieldOptions([]);
    }
  }, [editedData]);

  const handleMouseDown = useCallback(() => {
    setIsResizing(true);
  }, []);

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
    setIsFileLoading(true);
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
      } finally {
        setIsFileLoading(false);
      }
    };

    reader.onerror = () => {
      setLoadError("Failed to read file");
      setIsFileLoading(false);
    };

    // Small delay to let React render loading state before blocking read
    setTimeout(() => {
      reader.readAsText(file);
    }, 50);
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
      <LoadingOverlay
        isLoading={isSorting || isGenerating || isAnalyzing || isFileLoading}
        message={
          isSorting ? "Sorting..." :
            isGenerating ? "Data Generation in Progress..." :
              isAnalyzing ? "Analyzing JSON Structure..." :
                isFileLoading ? "Reading File..." :
                  "Loading..."
        }
      />
      <div className="toolbar">
        <label>
          Load JSON file
          <input type="file" accept=".json" onChange={handleFileLoad} />
        </label>
        <button onClick={() => loadTestFile("fruit")}>Load fruit test</button>
        <button onClick={() => loadTestFile("cars")}>Load cars test</button>
        <button
          onClick={() => {
            if (!editedData) {
              alert('Please load a JSON file first to use as a template');
              return;
            }

            setIsGenerating(true);

            // Defer generation to allow UI to update
            setTimeout(() => {
              try {
                const largeData = generateLargeTestData(editedData, 10000);
                if (largeData) {
                  setSourceData(largeData);
                  setEditedData(JSON.parse(JSON.stringify(largeData)));
                  // Add checkmark to console
                  console.log(`✓ Generated 10,000 rows at ${new Date().toLocaleTimeString()}`);
                  alert('Generated 10,000 rows of test data!');
                }
              } catch (e) {
                console.error(e);
                alert('Error generating data: ' + e);
              } finally {
                setIsGenerating(false);
              }
            }, 50);
          }}
          disabled={isGenerating}
          style={{ background: '#ff6600', borderColor: '#ff6600', opacity: isGenerating ? 0.7 : 1 }}
          title="Generate 10,000 randomized rows from current data structure"
        >
          {isGenerating ? "Generating..." : "🔥 Generate 10k rows"}
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginLeft: "auto", flexWrap: "wrap" }}>
          <input
            type="text"
            list="container-paths"
            placeholder={isAnalyzing ? "Analyzing structure..." : "Sort path (e.g. view.classes)"}
            value={sortContainer}
            onChange={(e) => setSortContainer(e.target.value)}
            disabled={isAnalyzing}
            style={{
              padding: "0.4rem",
              background: isAnalyzing ? "#222" : "#0a1929",
              color: "var(--text)",
              border: "1px solid #00ffff",
              borderRadius: "4px",
              minWidth: "180px",
              opacity: isAnalyzing ? 0.7 : 1
            }}
          />
          <datalist id="container-paths">
            {containerOptions.map((c) => <option key={c.path} value={c.path} />)}
          </datalist>

          <input
            type="text"
            placeholder="Field (optional)"
            value={manualSortField}
            onChange={(e) => setManualSortField(e.target.value)}
            title="Sort field (e.g. name, type, classification[0]) - Leave empty if sorting object keys or simple array"
            style={{
              padding: "0.4rem",
              background: "#0a1929",
              color: "var(--text)",
              border: "1px solid #00ffff",
              borderRadius: "4px",
              width: "120px"
            }}
          />

          {analysisSkipped && (
            <button
              onClick={() => {
                if (editedData && workerRef.current) {
                  setAnalysisSkipped(false);
                  setIsAnalyzing(true);
                  workerRef.current.postMessage({ type: 'ANALYZE', data: editedData });
                }
              }}
              style={{ background: "#9c27b0", borderColor: "#9c27b0" }}
              title="Force full structure analysis (may take a moment)"
            >
              Scan
            </button>
          )}



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
              let containerPath = sortContainer;
              let sortField = manualSortField; // Default to manual input if provided

              // If manual input is empty, try to derive from analyzed options
              if (!sortField) {
                const selectedOpt = containerOptions.find(c => c.path === sortContainer);
                if (selectedOpt?.availableFields?.length === 1) {
                  sortField = selectedOpt.availableFields[0];
                  // Remove field from container path if it was appended (legacy logic for single-field arrays)
                  // But since we separated inputs, the container path should technically be the container.
                  // However, for backwards compatibility with the dropdown logic:
                  if (selectedOpt.path.endsWith('.' + sortField)) {
                    // container path in options might be 'view.classes', or 'view.classes.name'
                    // based on getSortableContainers logic:
                    // "path: `${container.path}.${field}`" was added for arrays.
                    // So if we selected one of those, the actual container is the parent.
                    const lastDotIndex = sortContainer.lastIndexOf('.');
                    if (lastDotIndex > 0) containerPath = sortContainer.substring(0, lastDotIndex);
                  }
                }
              }

              // Check if this path is protected
              if (isPathProtected(containerPath, Array.from(protectedPaths))) {
                alert(`"${containerPath}" is protected and cannot be sorted`);
                return;
              }

              // Show loading state
              setIsSorting(true);

              if (workerRef.current) {
                // Send data to worker
                workerRef.current.postMessage({
                  type: 'SORT',
                  data: editedData,
                  containerPath,
                  sortField,
                  sortDirection
                });
              } else {
                console.error("Worker not initialized");
                setIsSorting(false);
              }


            }}
            title="Sort using inputs above"
            style={{ padding: "0.4rem 0.8rem", fontWeight: "bold" }}
            disabled={isSorting}
          >
            {isSorting ? "Sorting..." : "Sort"}
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

      {(isSorting || isGenerating) && (
        <div style={{ position: "fixed", bottom: "20px", right: "20px", background: "#00ffff", color: "#000", padding: "1rem 2rem", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,255,255,0.4)", fontWeight: "bold", fontSize: "16px", zIndex: 10000 }}>
          {isGenerating ? "Data Generation in Progress..." : "⏳ Sorting large dataset..."}
        </div>
      )}
    </div>
  );
}
