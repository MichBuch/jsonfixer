"use client";

import { useState, useCallback } from "react";
import JsonEditor from "./components/JsonEditor";
import { fruitCatalog, vehicleInventory, deepHierarchy, obfData } from "./test-data";

type JsonObject = { [key: string]: unknown };
type JsonValue = string | number | boolean | null | JsonObject | unknown[];

function shuffleArray<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function shuffleJson(obj: JsonValue): JsonValue {
  if (Array.isArray(obj)) {
    return shuffleArray(obj.map((v) => shuffleJson(v as JsonValue)));
  }
  if (obj !== null && typeof obj === "object") {
    const keys = shuffleArray(Object.keys(obj as JsonObject));
    const out: JsonObject = {};
    keys.forEach((k) => (out[k] = shuffleJson((obj as JsonObject)[k] as JsonValue)));
    return out;
  }
  return obj;
}

function syntaxHighlight(json: string): string {
  return json
    .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?)/g, (m) => {
      if (m.endsWith(":")) return `<span class="key">${m.slice(0, -1)}</span>:`;
      return `<span class="string">${m}</span>`;
    })
    .replace(/\b(true|false)\b/g, "<span class='boolean'>$1</span>")
    .replace(/\b(null)\b/g, "<span class='null'>$1</span>")
    .replace(/\b(-?\d+\.?\d*)\b/g, "<span class='number'>$1</span>");
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

export default function Page() {
  const [sourceData, setSourceData] = useState<JsonObject | null>(null);
  const [editedData, setEditedData] = useState<JsonObject | null>(null);
  const [sourceFileName, setSourceFileName] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [validation, setValidation] = useState<{ ok: boolean; msg: string } | null>(null);
  const [sortMode, setSortMode] = useState<"by-key" | "by-value">("by-key");
  const [sortByPath, setSortByPath] = useState<string>("");
  const [sortContainer, setSortContainer] = useState<string>("");
  const [sortValuePath, setSortValuePath] = useState<string>("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [lastSort, setLastSort] = useState<string>("");
  const [jsonError, setJsonError] = useState<{ error: string; raw: string; suggestions: string[] } | null>(null);

  const validate = useCallback(() => {
    if (!editedData) {
      setValidation({ ok: false, msg: "No data loaded" });
      return;
    }
    try {
      JSON.parse(JSON.stringify(editedData));
      const errs = validateJsonValue(editedData, "root");
      if (errs.length) {
        setValidation({ ok: false, msg: errs.join("; ") });
      } else {
        setValidation({ ok: true, msg: "Valid JSON. No control chars. Safe for API/DB." });
      }
    } catch (e) {
      setValidation({ ok: false, msg: String(e) });
    }
  }, [editedData]);

  const saveCopy = useCallback(() => {
    if (!editedData || !sourceFileName) return;
    const base = sourceFileName.replace(/\.json$/i, "");
    const name = `${base}_copy.json`;
    const blob = new Blob([JSON.stringify(editedData, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [editedData, sourceFileName]);

  const handleFileLoad = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoadError(null);
    setJsonError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      try {
        const parsed = JSON.parse(text) as JsonObject;
        setSourceData(parsed);
        setEditedData(JSON.parse(JSON.stringify(parsed)));
        setSourceFileName(file.name);
        setJsonError(null);
      } catch (err: any) {
        const errorMsg = err.message || String(err);
        const errors: Array<{ line: number; col: number; issue: string; fix: string }> = [];
        
        const lines = text.split('\n');
        const posMatch = errorMsg.match(/position (\d+)/);
        let errorPos = -1;
        if (posMatch) {
          errorPos = parseInt(posMatch[1]);
        }
        
        // Find line/col from position
        let currentPos = 0;
        let errorLine = -1;
        let errorCol = -1;
        for (let i = 0; i < lines.length; i++) {
          if (currentPos + lines[i].length >= errorPos) {
            errorLine = i;
            errorCol = errorPos - currentPos;
            break;
          }
          currentPos += lines[i].length + 1;
        }
        
        if (errorLine >= 0) {
          const line = lines[errorLine];
          const char = line[errorCol];
          
          if (char === "'") {
            errors.push({ line: errorLine, col: errorCol, issue: `Single quote at position ${errorCol}`, fix: 'Change to double quote (")' });
          } else if (char === ',' && line.substring(errorCol).match(/^\s*[}\]]/)) {
            errors.push({ line: errorLine, col: errorCol, issue: 'Trailing comma before closing bracket', fix: 'Remove this comma' });
          } else {
            errors.push({ line: errorLine, col: errorCol, issue: `Unexpected character: "${char}"`, fix: 'Check syntax at this position' });
          }
        }
        
        // Additional checks
        lines.forEach((line, i) => {
          if (line.includes("'")) {
            const col = line.indexOf("'");
            if (!errors.some(e => e.line === i && e.col === col)) {
              errors.push({ line: i, col, issue: 'Single quote found', fix: 'Replace with double quote (")' });
            }
          }
          const trailingComma = line.match(/,(\s*)[}\]]/);
          if (trailingComma) {
            const col = line.indexOf(trailingComma[0]);
            if (!errors.some(e => e.line === i && e.col === col)) {
              errors.push({ line: i, col, issue: 'Trailing comma', fix: 'Remove comma before closing bracket' });
            }
          }
        });
        
        setJsonError({ error: errorMsg, raw: text, suggestions: errors.map(e => `Line ${e.line + 1}, Col ${e.col + 1}: ${e.issue} → ${e.fix}`) });
        setSourceData(null);
        setEditedData(null);
        setSourceFileName(file.name);
      }
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  }, []);

  const loadTestFile = useCallback((which: "fruit" | "cars" | "deep" | "obf") => {
    setLoadError(null);
    try {
      const parsed = which === "fruit" ? fruitCatalog : which === "cars" ? vehicleInventory : which === "deep" ? deepHierarchy : obfData;
      const data = JSON.parse(JSON.stringify(parsed)) as JsonObject;
      setSourceData(JSON.parse(JSON.stringify(data)));
      setEditedData(JSON.parse(JSON.stringify(data)));
      setSourceFileName(which === "fruit" ? "fruit-catalog.json" : which === "cars" ? "vehicle-inventory.json" : which === "deep" ? "deep-hierarchy.json" : "obf-data.json");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
      setSourceData(null);
      setEditedData(null);
    }
  }, []);

  return (
    <div className="app">
      <div className="toolbar">
        <label>
          Load JSON file
          <input type="file" accept=".json" onChange={handleFileLoad} />
        </label>
        <button onClick={() => loadTestFile("fruit")}>Load fruit test</button>
        <button onClick={() => loadTestFile("cars")}>Load cars test</button>
        <button onClick={() => loadTestFile("deep")}>Load deep hierarchy test</button>
        <button onClick={() => loadTestFile("obf")}>Load obf data</button>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginLeft: "auto" }}>
          <input
            type="text"
            placeholder="Container (e.g. cars)"
            value={sortContainer}
            onChange={(e) => setSortContainer(e.target.value)}
            style={{ padding: "0.4rem", background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "4px", minWidth: "120px" }}
          />
          <input
            type="text"
            placeholder="By value path (e.g. engine.power) or leave empty for keys"
            value={sortValuePath}
            onChange={(e) => setSortValuePath(e.target.value)}
            style={{ padding: "0.4rem", background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "4px", minWidth: "200px" }}
          />
          <select value={sortDirection} onChange={(e) => setSortDirection(e.target.value as "asc" | "desc")} style={{ padding: "0.4rem", background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "4px" }}>
            <option value="asc">A→Z</option>
            <option value="desc">Z→A</option>
          </select>
          <button onClick={() => {
            if (!editedData || !sortContainer) return;
            const sortKey = `${sortContainer}|${sortValuePath}`;
            let direction = sortDirection;
            if (sortKey === lastSort) {
              direction = sortDirection === "asc" ? "desc" : "asc";
              setSortDirection(direction);
            }
            setLastSort(sortKey);
            
            const findTarget = (obj: any, name: string): any => {
              if (obj && typeof obj === "object") {
                if (obj[name]) return obj[name];
                for (const key of Object.keys(obj)) {
                  const found = findTarget(obj[key], name);
                  if (found) return found;
                }
              }
              return null;
            };
            
            const parts = sortContainer.split(".");
            let target: any = editedData;
            
            if (parts.length === 1) {
              target = findTarget(editedData, sortContainer);
              if (!target) return;
            } else {
              for (const p of parts) {
                if (!target[p]) return;
                target = target[p];
              }
            }
            if (typeof target === "object" && !Array.isArray(target)) {
              const keys = Object.keys(target).sort((a, b) => {
                if (!sortValuePath) {
                  return direction === "asc" ? a.localeCompare(b) : b.localeCompare(a);
                }
                const getVal = (obj: any, path: string) => {
                  const ps = path.split(".");
                  let v: any = obj;
                  for (const pp of ps) {
                    if (v && typeof v === "object") v = v[pp];
                    else return null;
                  }
                  return v;
                };
                const valA = getVal(target[a], sortValuePath);
                const valB = getVal(target[b], sortValuePath);
                
                if (typeof valA === "number" && typeof valB === "number") {
                  return direction === "asc" ? valA - valB : valB - valA;
                }
                
                const strA = valA === null ? "" : String(valA);
                const strB = valB === null ? "" : String(valB);
                return direction === "asc" ? strA.localeCompare(strB) : strB.localeCompare(strA);
              });
              const sorted: any = {};
              keys.forEach(k => sorted[k] = target[k]);
              Object.keys(target).forEach(k => delete target[k]);
              Object.assign(target, sorted);
              setEditedData(JSON.parse(JSON.stringify(editedData)));
            }
          }} disabled={!editedData || !sortContainer}>
            Sort
          </button>
        </div>
        <button onClick={validate}>Validate</button>
        <button onClick={saveCopy} disabled={!sourceFileName}>Save as _copy.json</button>
        {validation && (
          <span className={validation.ok ? "validation-ok" : "validation-err"}>
            {validation.msg}
          </span>
        )}
        {loadError && <span className="validation-err">{loadError}</span>}
      </div>

      {editedData && sourceData && (
        <div className="panes">
          <div className="pane">
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
          <div className="pane">
            <div className="pane-header">Edited JSON (changes highlighted)</div>
            <div className="pane-content">
              <pre
                className="json-raw"
                dangerouslySetInnerHTML={{
                  __html: (() => {
                    const sourceStr = JSON.stringify(sourceData, null, 2);
                    const editedStr = JSON.stringify(editedData, null, 2);
                    const sourceLines = sourceStr.split('\n');
                    const editedLines = editedStr.split('\n');
                    const highlighted = syntaxHighlight(editedStr);
                    const hlLines = highlighted.split('\n');
                    const final = hlLines.map((line, i) => {
                      if (sourceLines[i] !== editedLines[i]) {
                        return `<span class="diff-changed">${line}</span>`;
                      }
                      return line;
                    }).join('\n');
                    return final;
                  })(),
                }}
              />
            </div>
          </div>
        </div>
      )}

      {jsonError && (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "2rem" }}>
          <h2 style={{ color: "#f87171", margin: "0 0 1rem 0" }}>Invalid JSON - Fix Errors to Load</h2>
          <p><strong>Parse Error:</strong> {jsonError.error}</p>
          
          {jsonError.suggestions.length > 0 && (
            <div style={{ marginTop: "1rem", background: "rgba(239, 68, 68, 0.1)", padding: "1rem", borderRadius: "4px", border: "1px solid #ef4444" }}>
              <strong>Issues Found:</strong>
              <ul style={{ margin: "0.5rem 0", paddingLeft: "1.5rem" }}>
                {jsonError.suggestions.map((s, i) => (
                  <li key={i} style={{ marginBottom: "0.5rem" }}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          
          <div style={{ marginTop: "1rem", flex: 1, display: "flex", flexDirection: "column" }}>
            <strong>Edit JSON (fix errors and click "Retry Parse"):</strong>
            <textarea
              value={jsonError.raw}
              onChange={(e) => setJsonError({ ...jsonError, raw: e.target.value })}
              style={{ 
                flex: 1,
                marginTop: "0.5rem",
                padding: "1rem", 
                background: "var(--surface)", 
                color: "var(--text)",
                border: "1px solid var(--border)", 
                borderRadius: "4px",
                fontFamily: "Consolas, monospace",
                fontSize: "13px",
                lineHeight: "1.5",
                resize: "none",
                whiteSpace: "pre",
                overflowWrap: "normal",
                overflowX: "auto"
              }}
              spellCheck={false}
            />
          </div>
          
          <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
            <button onClick={() => {
              try {
                const parsed = JSON.parse(jsonError.raw);
                setSourceData(parsed);
                setEditedData(JSON.parse(JSON.stringify(parsed)));
                setSourceFileName(sourceFileName || "fixed.json");
                setJsonError(null);
              } catch (e: any) {
                setJsonError({ 
                  error: e.message, 
                  raw: jsonError.raw, 
                  suggestions: [`Parse failed: ${e.message}`] 
                });
              }
            }} style={{ padding: "0.5rem 1rem", background: "#22c55e", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>
              Retry Parse
            </button>
            <button onClick={() => {
              let fixed = jsonError.raw;
              fixed = fixed.replace(/'/g, '"');
              fixed = fixed.replace(/,(\s*)[}\]]/g, '$1}]');
              setJsonError({ ...jsonError, raw: fixed });
            }} style={{ padding: "0.5rem 1rem", background: "var(--border)", color: "var(--text)", border: "1px solid var(--accent)", borderRadius: "4px", cursor: "pointer" }}>
              Auto-Fix Common Issues
            </button>
          </div>
        </div>
      )}

      {!editedData && !jsonError && (
        <div className="pane-content" style={{ padding: "2rem", textAlign: "center" }}>
          Load a JSON file or use a test file to begin. All processing is client-side.
        </div>
      )}

      <div className="status-bar">
        {sourceFileName ? `File: ${sourceFileName} → ${sourceFileName.replace(/\.json$/i, "")}_copy.json` : "No file loaded"}
      </div>
    </div>
  );
}
