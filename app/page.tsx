"use client";

import { useState, useCallback } from "react";
import JsonEditor from "./components/JsonEditor";
import { fruitCatalog, vehicleInventory, deepHierarchy } from "./test-data";

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
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        const parsed = JSON.parse(text) as JsonObject;
        setSourceData(parsed);
        setEditedData(JSON.parse(JSON.stringify(parsed)));
        setSourceFileName(file.name);
      } catch (err) {
        setLoadError(String(err));
        setSourceData(null);
        setEditedData(null);
        setSourceFileName(null);
      }
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  }, []);

  const loadTestFile = useCallback((which: "fruit" | "cars" | "deep") => {
    setLoadError(null);
    try {
      const parsed = which === "fruit" ? fruitCatalog : which === "cars" ? vehicleInventory : deepHierarchy;
      const data = JSON.parse(JSON.stringify(parsed)) as JsonObject;
      setSourceData(JSON.parse(JSON.stringify(data)));
      setEditedData(JSON.parse(JSON.stringify(data)));
      setSourceFileName(which === "fruit" ? "fruit-catalog.json" : which === "cars" ? "vehicle-inventory.json" : "deep-hierarchy.json");
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
            placeholder="Sort by (e.g. engine.power)"
            value={sortValuePath}
            onChange={(e) => setSortValuePath(e.target.value)}
            style={{ padding: "0.4rem", background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "4px", minWidth: "150px" }}
          />
          <select value={sortDirection} onChange={(e) => setSortDirection(e.target.value as "asc" | "desc")} style={{ padding: "0.4rem", background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "4px" }}>
            <option value="asc">A→Z</option>
            <option value="desc">Z→A</option>
          </select>
          <button onClick={() => {
            if (!editedData || !sortContainer || !sortValuePath) return;
            const parts = sortContainer.split(".");
            let target: any = editedData;
            for (const p of parts) {
              if (!target[p]) return;
              target = target[p];
            }
            if (typeof target === "object" && !Array.isArray(target)) {
              const keys = Object.keys(target).sort((a, b) => {
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
                const strA = valA === null ? "" : String(valA);
                const strB = valB === null ? "" : String(valB);
                return sortDirection === "asc" ? strA.localeCompare(strB) : strB.localeCompare(strA);
              });
              const sorted: any = {};
              keys.forEach(k => sorted[k] = target[k]);
              Object.keys(target).forEach(k => delete target[k]);
              Object.assign(target, sorted);
              setEditedData(JSON.parse(JSON.stringify(editedData)));
            }
          }} disabled={!editedData || !sortContainer || !sortValuePath}>
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
            <div className="pane-header">Editor: click to select, right-click → Sort A-Z</div>
            <div className="pane-content">
              <JsonEditor
                data={editedData}
                onChange={(next) => setEditedData(next)}
                sortMode={sortMode}
                sortByPath={sortByPath}
              />
            </div>
          </div>
        </div>
      )}

      {!editedData && (
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
