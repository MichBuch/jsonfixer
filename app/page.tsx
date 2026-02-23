"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import JsonEditor from "./components/JsonEditor";
import VirtualSourceViewer from "./components/VirtualSourceViewer";
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
import { sortContainer as _sortContainer, type SortReport } from "./lib/sorter";

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
  const [jsonError, setJsonError] = useState<{ error: string; raw: string; suggestions: string[] } | null>(null);
  const [leftPaneWidth, setLeftPaneWidth] = useState<number>(50); // percentage
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const [structureAnalysis, setStructureAnalysis] = useState<StructureAnalysis | null>(null);
  const [containerOptions, setContainerOptions] = useState<ContainerInfo[]>([]);
  const [protectedContainers, setProtectedContainers] = useState<ContainerInfo[]>([]);
  const [lineMap, setLineMap] = useState<Map<string, number>>(new Map());

  // Undo history now stores both data and lineMap
  const [undoHistory, setUndoHistory] = useState<{ data: JsonObject, lineMap: Map<string, number> }[]>([]);
  const [sortFieldOptions, setSortFieldOptions] = useState<string[]>([]);
  const [isSorting, setIsSorting] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisSkipped, setAnalysisSkipped] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isFileLoading, setIsFileLoading] = useState<boolean>(false);
  const [manualSortField, setManualSortField] = useState<string>("");
  const [txOrderText, setTxOrderText] = useState<string | null>(null);
  const [txOrderFileName, setTxOrderFileName] = useState<string>("");
  const [scanStatusMsg, setScanStatusMsg] = useState<string>("");
  const scanStartRef = useRef<number>(0);
  const [leftSearch, setLeftSearch] = useState<string>("");
  const [rightSearch, setRightSearch] = useState<string>("");
  const [debouncedLeftSearch, setDebouncedLeftSearch] = useState<string>("");
  const [debouncedRightSearch, setDebouncedRightSearch] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [editorViewMode, setEditorViewMode] = useState<"tree" | "text">("text");
  const [lastSortReport, setLastSortReport] = useState<SortReport | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const sortParamsRef = useRef<{ containerPath: string; sortField: string; countBefore: number; direction: "asc" | "desc"; startMs: number } | null>(null);
  const leftSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rightSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
          if (result.lineMap) setLineMap(result.lineMap);
          setIsAnalyzing(false);
          setIsFileLoading(false);
          // Show scan duration
          if (scanStartRef.current > 0) {
            const elapsed = Date.now() - scanStartRef.current;
            const h = String(Math.floor(elapsed / 3600000)).padStart(2, '0');
            const m = String(Math.floor((elapsed % 3600000) / 60000)).padStart(2, '0');
            const s = String(Math.floor((elapsed % 60000) / 1000)).padStart(2, '0');
            setScanStatusMsg(`Scanned in ${h}:${m}:${s}`);
            scanStartRef.current = 0;
          }
        } else if (type === 'SORT_RESULT') {
          // Build sort report
          const params = sortParamsRef.current;
          const countAfter: number = itemCount ?? 0;
          setLastSortReport({
            containerPath: params?.containerPath ?? "",
            sortKey: params?.sortField ?? "",
            direction: params?.direction ?? "asc",
            countBefore: countAfter,
            countAfter,
            integrityPassed: true,
            movementLog: [],
            durationMs: params ? Date.now() - params.startMs : 0,
          });

          // Push current state to undo history before updating
          setUndoHistory(prev => [...prev, { data: editedData as JsonObject, lineMap: lineMap }]);

          setEditedData(result);
          if (e.data.lineMap) setLineMap(e.data.lineMap);
          setIsSorting(false);
          console.log(`✓ Sort complete: ${itemCount} items sorted. LineMap size: ${e.data.lineMap?.size}`);
        }
      } else {
        console.error(error);
        alert(type === 'SORT_RESULT' ? 'Sort failed: ' + error : 'Analysis failed: ' + error);
        setIsSorting(false);
        setIsAnalyzing(false);
        setIsFileLoading(false);
      }
    };

    workerRef.current.onerror = (err) => {
      console.error(err);
      setIsSorting(false);
      setIsAnalyzing(false);
      setIsFileLoading(false);
    };

    return () => {
      workerRef.current?.terminate();
    };
  }, []); // Empty dependency array = run once on mount



  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());

  // Analyze JSON structure whenever data changes
  useEffect(() => {
    if (editedData && workerRef.current) {
      // Skip auto-analysis for large files to prevent hang
      // Check for array length or object key count instead of stringifying
      let isLarge = false;
      if (Array.isArray(editedData)) {
        if (editedData.length > 2000) isLarge = true;
      } else if (editedData && typeof editedData === 'object') {
        // Quick check for object keys - might still be expensive for massive objects but better than stringify
        // For very large objects, Object.keys might still be slow, but usually fine up to 10k.
        // We can optimize further if needed, but start here.
        if (Object.keys(editedData).length > 2000) isLarge = true;
      }

      if (isLarge) {
        console.log("Large file detected (>2000 items). Skipping auto-analysis.");
        setAnalysisSkipped(true);
        setStructureAnalysis(null); // Clear previous analysis
        return;
      }

      setAnalysisSkipped(false);
      setIsAnalyzing(true);
      setScanStatusMsg("Scanning...");
      scanStartRef.current = Date.now();
      // Send to worker for initial analysis and Line Map generation
      workerRef.current.postMessage({
        type: 'ANALYZE',
        data: editedData,
        jsonString: JSON.stringify(editedData, null, 2) // Pass raw text for line mapping
      });
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
    // Auto-collapse for large test data
    const topKeys = new Set(Object.keys(mutableData));
    setCollapsedPaths(topKeys.size > 100 ? topKeys : new Set());
    setEditorViewMode('text');
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
        // Auto-collapse top-level keys for large files to prevent UI freeze
        const topKeys = Object.keys(json);
        const totalElements = topKeys.reduce((sum, k) => {
          const v = json[k];
          return sum + (Array.isArray(v) ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : 1));
        }, 0);
        if (totalElements > 500) {
          setCollapsedPaths(new Set(topKeys));
          setEditorViewMode('text');
          console.log(`Large file detected (${totalElements} elements) — auto-switched to Text View`);
        } else {
          setCollapsedPaths(new Set());
          setEditorViewMode('text');
        }

        // Send to worker for initial analysis and Line Map generation
        if (workerRef.current) {
          workerRef.current.postMessage({
            type: 'ANALYZE',
            data: json,
            jsonString: text // Pass raw text for line mapping
          });
        }
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
    setIsProcessing(true);
    setTimeout(() => {
      try {
        JSON.stringify(editedData);
        setValidation({ ok: true, msg: "✓ Valid JSON" });
      } catch (e: any) {
        setValidation({ ok: false, msg: `✗ Invalid: ${e.message}` });
      }
      setIsProcessing(false);
    }, 50);
  };

  // Sort all attributes within each class by viewname (ASC).
  // Classes stay in their original order. Each attribute object moves as a whole unit.
  // Works with any file that has view.classes[].attributes[].viewname structure.
  const sortAttributesByViewname = useCallback((data: JsonObject): JsonObject => {
    const clone = JSON.parse(JSON.stringify(data));
    const classes = (clone as any)?.view?.classes;
    if (!Array.isArray(classes)) {
      alert('Expected view.classes to be an array');
      return clone;
    }
    let totalSorted = 0;
    classes.forEach((cls: any) => {
      if (!cls || !Array.isArray(cls.attributes)) return;
      cls.attributes.sort((a: any, b: any) => {
        const va = String(a?.viewname ?? '');
        const vb = String(b?.viewname ?? '');
        return va.localeCompare(vb);
      });
      totalSorted += cls.attributes.length;
    });
    console.log(`✓ Sorted ${totalSorted} attributes across ${classes.length} classes by viewname`);
    return clone;
  }, []);

  const saveCopy = () => {
    if (!editedData || !sourceFileName) return;
    setIsProcessing(true);
    setTimeout(() => {
      const baseName = sourceFileName.replace(/\.json$/i, "");
      const copy = `${baseName}_copy.json`;
      const blob = new Blob([JSON.stringify(editedData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = copy;
      a.click();
      URL.revokeObjectURL(url);
      setIsProcessing(false);
    }, 50);
  };



  // VirtualSourceViewer handles highlighting efficiently on-the-fly.
  // We no longer need pre-computed HTML strings.
  const sourceJsonString = useMemo(() => {
    if (!sourceData) return '';
    return JSON.stringify(sourceData, null, 2);
  }, [sourceData]);

  const editedJsonString = useMemo(() => {
    if (!editedData) return '';
    return JSON.stringify(editedData, null, 2);
  }, [editedData]);

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

  const collapseAll = useCallback(() => {
    if (!editedData) return;
    setIsProcessing(true);
    // Use setTimeout so overlay renders before heavy work
    setTimeout(() => {
      const isObject = (v: any): v is JsonObject => v !== null && typeof v === "object" && !Array.isArray(v);
      const isArray = (v: any): v is JsonArray => Array.isArray(v);

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
      collectPaths(editedData);
      setCollapsedPaths(allPaths);
      setIsProcessing(false);
    }, 50);
  }, [editedData]);

  const expandAll = useCallback(() => {
    setIsProcessing(true);
    setTimeout(() => {
      setCollapsedPaths(new Set());
      setIsProcessing(false);
    }, 50);
  }, []);

  return (
    <div className="app">
      <LoadingOverlay
        isLoading={isSorting || isGenerating || isAnalyzing || isFileLoading || isProcessing}
        message={
          isSorting ? "Sorting..." :
            isGenerating ? "Data Generation in Progress..." :
              isAnalyzing ? "Analyzing JSON Structure..." :
                isFileLoading ? "Reading File..." :
                  isProcessing ? "Processing..." :
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
              alert('Load a JSON file first');
              return;
            }
            if (!workerRef.current) {
              alert('Worker not ready');
              return;
            }
            sortParamsRef.current = {
              containerPath: 'view.classes.*.attributes',
              sortField: 'viewname',
              countBefore: -1,
              direction: 'asc',
              startMs: Date.now(),
            };
            setIsSorting(true);
            workerRef.current.postMessage({
              type: 'SORT_VIEWNAME',
              data: editedData,
            });
          }}
          style={{ background: '#e65100', borderColor: '#ff6d00' }}
          title="Sort all attributes within each class by viewname (runs in worker — safe for large files)"
        >
          ⚡ Sort Attrs by Viewname
        </button>
        <button
          onClick={() => {
            if (!editedData) {
              alert('Load a JSON file first');
              return;
            }
            if (!workerRef.current) {
              alert('Worker not ready');
              return;
            }
            const doSort = (orderText: string, fileName: string) => {
              sortParamsRef.current = {
                containerPath: 'view.classes.*.attributes',
                sortField: 'viewname (TX: ' + fileName + ')',
                countBefore: -1,
                direction: 'asc',
                startMs: Date.now(),
              };
              setIsSorting(true);
              workerRef.current!.postMessage({
                type: 'SORT_TX',
                data: editedData,
                orderText,
              });
            };
            if (txOrderText) {
              // Order file already loaded — apply immediately
              doSort(txOrderText, txOrderFileName);
            } else {
              // First time — prompt for order file
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.txt,.csv';
              input.onchange = (ev) => {
                const file = (ev.target as HTMLInputElement).files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (re) => {
                  const text = re.target?.result as string;
                  if (!text) { alert('Empty sort order file'); return; }
                  setTxOrderText(text);
                  setTxOrderFileName(file.name);
                  doSort(text, file.name);
                };
                reader.readAsText(file);
              };
              input.click();
            }
          }}
          style={{ background: '#6a1b9a', borderColor: '#ab47bc' }}
          title={txOrderText ? `TX Sort using ${txOrderFileName} (click to apply)` : 'Pick a sort order file first, then click to apply'}
        >
          📋 TX Sort{txOrderText ? ` (${txOrderFileName})` : ''}
        </button>
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
                const largeData = generateLargeTestData(editedData, 1000);
                if (largeData) {
                  setSourceData(largeData);
                  setEditedData(JSON.parse(JSON.stringify(largeData)));
                  // Add checkmark to console
                  console.log(`✓ Generated 1,000 rows at ${new Date().toLocaleTimeString()}`);
                  alert('Generated 1,000 rows of test data!');
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
          title="Generate 1,000 randomized rows from current data structure"
        >
          {isGenerating ? "Generating..." : "🔥 Generate 1k rows"}
        </button>
        {scanStatusMsg && (
          <span style={{
            color: isAnalyzing ? "#fbbf24" : "#4ade80",
            fontSize: "12px",
            fontFamily: "monospace",
            whiteSpace: "nowrap",
          }}>
            {scanStatusMsg}
          </span>
        )}
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
            {containerOptions.map((c, idx) => (
              <option
                key={`${c.path}-${c.sortField ?? 'key'}-${idx}`}
                value={c.sortField ? `${c.path}.${c.sortField}` : c.path}
                label={`${c.itemCount} items`}
              />
            ))}
          </datalist>

          {editedData && (
            <button
              onClick={() => {
                if (editedData && workerRef.current) {
                  setAnalysisSkipped(false);
                  setIsAnalyzing(true);
                  setScanStatusMsg("Scanning...");
                  scanStartRef.current = Date.now();
                  workerRef.current.postMessage({
                    type: 'ANALYZE',
                    data: editedData,
                    jsonString: JSON.stringify(editedData, null, 2)
                  });
                }
              }}
              disabled={isAnalyzing}
              style={{ background: "#9c27b0", borderColor: "#9c27b0", opacity: isAnalyzing ? 0.7 : 1 }}
              title="Scan JSON structure to populate sort path dropdown"
            >
              {isAnalyzing ? "Scanning..." : "🔍 Scan Structure"}
            </button>
          )}

          {analysisSkipped && (
            <button
              onClick={() => {
                if (editedData && workerRef.current) {
                  setAnalysisSkipped(false);
                  setIsAnalyzing(true);
                  setScanStatusMsg("Scanning...");
                  scanStartRef.current = Date.now();
                  workerRef.current.postMessage({
                    type: 'ANALYZE',
                    data: editedData,
                    jsonString: JSON.stringify(editedData, null, 2) // Pass raw text for line mapping
                  });
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
              if (!editedData || !sortContainer) {
                alert('Please enter a sort path first');
                return;
              }

              const selectedPath = sortContainer.trim();

              // Match against containerOptions to find container path + sort field
              const match = (containerOptions as any[]).find((c: any) => {
                const fullPath = c.sortField ? `${c.path}.${c.sortField}` : c.path;
                return fullPath === selectedPath;
              });

              const containerPath = match?.path ?? selectedPath;
              const sortField = match?.sortField ?? undefined;

              console.log(`[sort] Sending — container: "${containerPath}", field: "${sortField ?? '(keys)'}", dir: "${sortDirection}"`);

              // Store params for the report
              sortParamsRef.current = {
                containerPath,
                sortField: sortField ?? "",
                countBefore: -1, // Will be set from worker response
                direction: sortDirection,
                startMs: Date.now(),
              };

              setIsSorting(true);

              if (workerRef.current) {
                workerRef.current.postMessage({
                  type: 'SORT',
                  data: editedData,
                  containerPath,
                  sortField,
                  sortDirection,
                  lineMap,
                });
              } else {
                console.error('[sort] Worker not initialized');
                setIsSorting(false);
              }
            }}
            title="Sort the selected container"
            style={{ padding: "0.4rem 0.8rem", fontWeight: "bold" }}
            disabled={isSorting || !sortContainer}
          >
            {isSorting ? "Sorting..." : "Sort"}
          </button>
          <button
            onClick={() => {
              if (undoHistory.length === 0) return;
              const previous = undoHistory[undoHistory.length - 1];
              setEditedData(previous.data);
              setLineMap(previous.lineMap);
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

      {/* Sort Report bar — shown after every sort, stays on undo */}
      {lastSortReport && (
        <div style={{
          padding: "0.3rem 1rem",
          background: lastSortReport.integrityPassed ? "rgba(74,222,128,0.08)" : "rgba(239,68,68,0.12)",
          borderBottom: `1px solid ${lastSortReport.integrityPassed ? "#4ade80" : "#ef4444"}`,
          display: "flex", gap: "1.5rem", alignItems: "center", flexWrap: "wrap",
          fontSize: "12px", fontFamily: "monospace", flexShrink: 0
        }}>
          <span style={{ color: lastSortReport.integrityPassed ? "#4ade80" : "#ef4444", fontWeight: "bold" }}>
            {lastSortReport.integrityPassed ? "✓ Sort OK" : "✗ Sort FAILED"}
          </span>
          <span>path: <b>{lastSortReport.containerPath}</b></span>
          <span>key: <b>{lastSortReport.sortKey || "(keys)"}</b> {lastSortReport.direction}</span>
          <span>before: <b>{lastSortReport.countBefore}</b> → after: <b>{lastSortReport.countAfter}</b></span>
          <span style={{ color: "#888" }}>{lastSortReport.durationMs}ms</span>
          {lastSortReport.error && <span style={{ color: "#ef4444" }}>{lastSortReport.error}</span>}
          {lastSortReport.integrityPassed && lastSortReport.movementLog.length > 0 && (
            <button
              onClick={() => {
                const r = lastSortReport;
                const header = `Movement Log | path: ${r.containerPath} | key: ${r.sortKey} | dir: ${r.direction} | ${new Date().toISOString()}\nTotal elements: ${r.countBefore}\n\n`;
                const rows = r.movementLog.map(e => `[${e.oldIndex}] line ${e.fromLine} → line ${e.toLine}  key: ${e.keyValue}`).join("\n");
                const blob = new Blob([header + rows], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a"); a.href = url; a.download = "movement-log.txt"; a.click();
                URL.revokeObjectURL(url);
              }}
              style={{ padding: "0.15rem 0.5rem", fontSize: "11px", background: "transparent", border: "1px solid #4ade80", color: "#4ade80", borderRadius: "3px", cursor: "pointer" }}
            >
              ⬇ Movement Log ({lastSortReport.movementLog.length})
            </button>
          )}
          <button onClick={() => setLastSortReport(null)} style={{ marginLeft: "auto", background: "transparent", border: "none", color: "#888", cursor: "pointer", fontSize: "14px" }}>✕</button>
        </div>
      )}

      {editedData && sourceData && (
        <div className="panes">
          <div className="pane" style={{ width: `${leftPaneWidth}%` }}>
            <div className="pane-header">Source (read-only)</div>
            <div style={{ padding: '8px', background: '#0f172a', borderBottom: '1px solid #333' }}>
              <input
                type="text"
                placeholder="🔍 Search source..."
                value={leftSearch}
                onChange={(e) => {
                  setLeftSearch(e.target.value);
                  if (leftSearchTimerRef.current) clearTimeout(leftSearchTimerRef.current);
                  const val = e.target.value;
                  leftSearchTimerRef.current = setTimeout(() => setDebouncedLeftSearch(val), 300);
                }}
                style={{
                  width: '100%', padding: '6px 8px', background: '#1e293b',
                  border: '1px solid #555', borderRadius: '4px', color: '#fff',
                  fontSize: '13px', fontFamily: 'monospace', outline: 'none',
                  boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)'
                }}
              />
            </div>
            <div className="pane-content">
              <VirtualSourceViewer
                jsonString={sourceJsonString}
                searchTerm={debouncedLeftSearch}
              />
            </div>
          </div>
          <div
            className={`pane-resizer ${isResizing ? 'resizing' : ''}`}
            onMouseDown={handleMouseDown}
          />
          <div className="pane" style={{ width: `${100 - leftPaneWidth}%` }}>
            <div className="pane-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Sorted / Edited</span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  onClick={() => setEditorViewMode(editorViewMode === 'tree' ? 'text' : 'tree')}
                  className="header-btn"
                  style={{ background: editorViewMode === 'text' ? '#00ffff33' : undefined }}
                  title="Toggle between Tree View and Text View"
                >
                  {editorViewMode === 'tree' ? '📄 Text View' : '🌳 Tree View'}
                </button>
                {editorViewMode === 'tree' && (
                  <>
                    <button
                      onClick={collapseAll}
                      className="header-btn"
                      title="Collapse All"
                    >
                      ▶ Collapse
                    </button>
                    <button
                      onClick={expandAll}
                      className="header-btn"
                      title="Expand All"
                    >
                      ▼ Expand
                    </button>
                  </>
                )}
              </div>
            </div>
            <div style={{ padding: '8px', background: '#0f172a', borderBottom: '1px solid #333' }}>
              <input
                type="text"
                placeholder="🔍 Search editor..."
                value={rightSearch}
                onChange={(e) => {
                  setRightSearch(e.target.value);
                  if (rightSearchTimerRef.current) clearTimeout(rightSearchTimerRef.current);
                  const val = e.target.value;
                  rightSearchTimerRef.current = setTimeout(() => setDebouncedRightSearch(val), 300);
                }}
                style={{
                  width: '100%', padding: '6px 8px', background: '#1e293b',
                  border: '1px solid #555', borderRadius: '4px', color: '#fff',
                  fontSize: '13px', fontFamily: 'monospace', outline: 'none',
                  boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)'
                }}
              />
            </div>
            <div className="pane-content">
              {editorViewMode === 'text' ? (
                <VirtualSourceViewer
                  jsonString={editedJsonString}
                  searchTerm={debouncedRightSearch}
                />
              ) : (
                <JsonEditor
                  data={editedData as Record<string, unknown>}
                  onChange={(updated) => setEditedData(updated as JsonObject)}
                  sortMode={sortValuePath ? "by-value" : "by-key"}
                  sortByPath={sortValuePath}
                  protectedPaths={Array.from(protectedPaths)}
                  collapsedPaths={collapsedPaths}
                  toggleCollapse={toggleCollapse}
                  searchTerm={debouncedRightSearch}
                  lineMap={lineMap}
                />
              )}
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
      <style jsx global>{`
        .app {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: #000;
          color: #fff;
          font-family: monospace;
          overflow: hidden;
        }
        .header-btn {
          background-color: #0f3460;
          color: white;
          border: 1px solid #00ffff;
          border-radius: 4px;
          padding: 2px 8px;
          cursor: pointer;
          font-size: 11px;
        }
        .header-btn:hover {
          background-color: #00ffff;
          color: #000;
        }
        .app * {
          box-sizing: border-box;
        }
        .toolbar {
          padding: 0.5rem 1rem;
          background: #0f172a;
          border-bottom: 1px solid #333;
          display: flex;
          gap: 1rem;
          align-items: center;
          flex-wrap: wrap;
        }
        .panes {
          display: flex;
          flex: 1;
          overflow: hidden;
        }
        .pane {
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .pane-header {
          padding: 0.5rem 1rem;
          background: #1e293b;
          border-bottom: 1px solid #333;
          font-weight: bold;
          font-size: 0.9rem;
          height: 36px; /* Fixed height for alignment */
          display: flex;
          align-items: center;
        }
        .pane-content {
          flex: 1;
          overflow: auto;
          padding: 0; /* Removing padding to allow line numbers to sit flush */
          position: relative;
        }
        .pane-resizer {
          width: 4px;
          background: #333;
          cursor: col-resize;
          transition: background 0.2s;
        }
        .pane-resizer:hover, .pane-resizer.resizing {
          background: #00ffff;
        }
        
        /* Line Numbers for Source View */
        .json-raw {
          margin: 0;
          font-family: 'Consolas', 'Monaco', monospace;
          font-size: 13px;
          line-height: 20px;
          counter-reset: line;
        }
        .json-raw span.line {
          display: block;
          position: relative;
          padding-left: 45px;
        }
        .json-raw span.line::before {
          counter-increment: line;
          content: counter(line);
          position: absolute;
          left: 0;
          width: 35px;
          text-align: right;
          color: #555;
          border-right: 1px solid #333;
          padding-right: 5px;
          user-select: none;
        }

        /* Syntax Highlight Colors */
        .key { color: #9cdcfe; }
        .string { color: #ce9178; }
        .number { color: #b5cea8; }
        .boolean { color: #569cd6; }
        .null { color: #569cd6; }

        .validation-ok { color: #4ade80; font-size: 0.9rem; }
        .validation-err { color: #ef4444; font-size: 0.9rem; }
        .validation-ok { color: #4ade80; font-size: 0.9rem; }
        .validation-err { color: #ef4444; font-size: 0.9rem; }

        .tree-key:hover .tree-actions { opacity: 1 !important; }
        .tree-node { font-family: 'Consolas', 'Monaco', monospace; }
      `}</style>
    </div>
  );
}

