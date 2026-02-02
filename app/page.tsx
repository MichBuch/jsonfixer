"use client";

import { useState, useCallback } from "react";
import JsonEditor from "./components/JsonEditor";

type JsonObject = { [key: string]: unknown };

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

export default function Page() {
  const [sourceData, setSourceData] = useState<JsonObject | null>(null);
  const [editedData, setEditedData] = useState<JsonObject | null>(null);
  const [sourceFileName, setSourceFileName] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  const loadTestFile = useCallback((path: string) => {
    setLoadError(null);
    fetch(path)
      .then((r) => r.json())
      .then((parsed: JsonObject) => {
        setSourceData(parsed);
        setEditedData(JSON.parse(JSON.stringify(parsed)));
        const name = path.split("/").pop() || "test.json";
        setSourceFileName(name);
      })
      .catch((err) => {
        setLoadError(String(err));
        setSourceData(null);
        setEditedData(null);
      });
  }, []);

  return (
    <div className="app">
      <div className="toolbar">
        <label>
          Load JSON file
          <input type="file" accept=".json" onChange={handleFileLoad} />
        </label>
        <button onClick={() => loadTestFile("/test-data/fruit-catalog.json")}>
          Load fruit test
        </button>
        <button onClick={() => loadTestFile("/test-data/vehicle-inventory.json")}>
          Load cars test
        </button>
        <button onClick={() => loadTestFile("/test-data/deep-hierarchy.json")}>
          Load deep hierarchy test
        </button>
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
            <div className="pane-header">Editor (drag ↑↓, sort ⇅, add +, delete ×)</div>
            <div className="pane-content">
              <JsonEditor
                data={editedData}
                onChange={setEditedData}
                sourceFileName={sourceFileName}
              />
            </div>
          </div>
          <div className="pane">
            <div className="pane-header">Edited output</div>
            <div className="pane-content">
              <pre
                className="json-raw"
                dangerouslySetInnerHTML={{
                  __html: syntaxHighlight(JSON.stringify(editedData, null, 2)),
                }}
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
