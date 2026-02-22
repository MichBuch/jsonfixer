# Implementation Plan: JSON Editor Overhaul

## Overview

Replace the existing fragile JSON editor with a clean, modular Next.js application. Build pure-function modules first (sorter, scanner, sanitizer, differ, log, snapshots), wire them into a minimal React UI, then add the virtual editor and comparison panel. No auth, no Web Workers for small datasets, no silent failures.

## Tasks

- [x] 1. Remove auth and scaffold clean project structure
  - Delete all authentication, license, and trial logic from `app/page.tsx`
  - Remove the login screen render path entirely
  - Create `app/lib/` directory for pure-function modules
  - Set up `vitest` and `fast-check` as dev dependencies
  - _Requirements: 1.4, 1.5, 12.1_

- [x] 2. Implement `fileLoader.ts`
  - [x] 2.1 Create `app/lib/fileLoader.ts` with `parseJsonFile(text: string): LoadResult`
    - Returns `{ data, filename, sizeBytes }` on success or `{ error }` on parse failure
    - _Requirements: 2.1, 2.2, 2.4_
  - [ ]* 2.2 Write unit tests for `fileLoader.ts`
    - Test valid JSON, invalid JSON (error message), empty string, nested structures
    - _Requirements: 2.4_

- [x] 3. Implement `structureScanner.ts`
  - [x] 3.1 Create `app/lib/structureScanner.ts` with `scanStructure(data: JsonValue): ScanResult`
    - Traverse JSON recursively, identify arrays whose elements are objects with at least one shared key
    - Record dot-notation path, element count, and available keys for each container
    - _Requirements: 3.1, 3.2_
  - [ ]* 3.2 Write property test for structure scanner
    - **Property: Scanner correctness** — for any JSON value, every path in `ScanResult.containers` must resolve to an array of objects with at least one shared key
    - Feature: json-editor-overhaul, Property 3 (scan correctness)
    - _Requirements: 3.1, 3.2_
  - [ ]* 3.3 Write unit tests for edge cases
    - Empty object, flat array of primitives (not sortable), nested arrays, mixed-type arrays
    - _Requirements: 3.6_

- [x] 4. Implement `sorter.ts`
  - [x] 4.1 Create `app/lib/sorter.ts` with `sortContainer(data: JsonValue, params: SortParams): SortResult`
    - Serialize pre-sort data to compute `fromLine` for each element (line number of opening `{` in formatted JSON)
    - Resolve container at `containerPath` using dot-notation
    - Record `countBefore`
    - Perform stable sort: numeric comparison for number values, `localeCompare` for strings
    - Serialize post-sort data to compute `toLine` for each element
    - Build `movementLog` — one `MovementEntry` per element with `oldIndex`, `newIndex`, `fromLine`, `toLine`, `keyValue`
    - Verify the set of `oldIndex` values is a complete bijection with `{0…N-1}` and same for `newIndex`
    - Record `countAfter`
    - If `countBefore !== countAfter` OR bijection check fails, return original data with `integrityPassed: false`
    - Return `{ data, report }` with full `SortReport` including `movementLog`
    - _Requirements: 4.2, 4.3, 4.4, 4.7, 4.8, 4.9, 4.10, 16.1, 16.2, 16.3, 16.4, 16.5_
  - [ ]* 4.2 Write property test: sort count invariant
    - **Property 1: Sort count invariant** — for any JSON and valid sort params, `countBefore === countAfter`
    - Feature: json-editor-overhaul, Property 1
    - _Requirements: 4.3_
  - [ ]* 4.3 Write property test: sort integrity gate
    - **Property 2: Sort integrity gate** — inject a sort that produces a count mismatch; verify returned data equals input data and `integrityPassed === false`
    - Feature: json-editor-overhaul, Property 2
    - _Requirements: 4.4_
  - [ ]* 4.4 Write property test: sort key ordering
    - **Property 3: Sort key ordering** — for any sorted container (asc), every adjacent pair satisfies `a[key] <= b[key]`; include numeric key generators
    - Feature: json-editor-overhaul, Property 3
    - _Requirements: 4.7, 4.8, 4.9_
  - [ ]* 4.5 Write property test: sort stability
    - **Property 4: Sort stability** — for any elements with equal sort key values, relative order is preserved
    - Feature: json-editor-overhaul, Property 4
    - _Requirements: 4.10_
  - [x] 4.6 Write property test: movement log completeness
    - **Property 11: Movement log completeness** — for any successful sort of N elements, the movement log has exactly N entries, oldIndex set equals `{0…N-1}`, newIndex set equals `{0…N-1}`
    - Feature: json-editor-overhaul, Property 11
    - _Requirements: 16.3, 16.4_
  - [x] 4.7 Write property test: movement log line accuracy
    - **Property 12: Movement log line accuracy** — for any successful sort, every `fromLine` matches the element's opening brace line in pre-sort JSON, every `toLine` matches in post-sort JSON
    - Feature: json-editor-overhaul, Property 12
    - _Requirements: 16.2_
  - [ ]* 4.8 Write unit tests for sorter edge cases
    - Empty array, single-element array, invalid container path, missing sort key on some elements
    - _Requirements: 4.1, 4.4_

- [x] 5. Checkpoint — ensure all module tests pass
  - Run `vitest --run` and confirm all tests pass before proceeding to UI work.

- [x] 6. Implement `sanitizer.ts`
  - [x] 6.1 Create `app/lib/sanitizer.ts` with `sanitizeUnixSafe(data: JsonValue): SanitizeResult`
    - Recursively traverse all string values
    - Apply: escape `"`, escape `\`, replace bare `\n`/`\r` with escape sequences, remove null bytes and control chars U+0000–U+001F (except `\t`, `\n`, `\r`)
    - Return `{ data, modifiedCount }`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.8_
  - [ ]* 6.2 Write property test: sanitization string-only
    - **Property 5: Sanitization string-only** — for any JSON value, non-string leaves are identical before and after sanitization
    - Feature: json-editor-overhaul, Property 5
    - _Requirements: 9.8_
  - [ ]* 6.3 Write property test: sanitization idempotence
    - **Property 6: Sanitization idempotence** — `sanitize(sanitize(x))` deep-equals `sanitize(x)` for any input
    - Feature: json-editor-overhaul, Property 6
    - _Requirements: 9.1–9.5_
  - [ ]* 6.4 Write unit tests for sanitizer
    - String with embedded quotes, backslashes, bare newlines, null bytes, control chars; nested objects; modification count accuracy
    - _Requirements: 9.6_

- [x] 7. Implement `operationLog.ts` and `snapshotStore.ts`
  - [x] 7.1 Create `app/lib/operationLog.ts` — `OperationLog` class with `append`, `getAll`, `exportText`
    - Each entry: `{ timestamp, operation, path?, params?, status, detail? }`
    - `exportText` returns newline-delimited human-readable log
    - _Requirements: 14.1, 14.2, 14.3, 14.5, 14.6_
  - [ ]* 7.2 Write property test: operation log append-only
    - **Property 9: Operation log append-only** — after any sequence of appends, `getAll().length` is monotonically non-decreasing and no prior entry is mutated
    - Feature: json-editor-overhaul, Property 9
    - _Requirements: 14.6_
  - [x] 7.3 Create `app/lib/snapshotStore.ts` — `SnapshotStore` class with `save`, `restore`, `list`
    - `list()` returns snapshots most-recent-first
    - _Requirements: 15.1, 15.2, 15.6, 15.7, 15.8_
  - [ ]* 7.4 Write property test: snapshot restore fidelity
    - **Property 10: Snapshot restore fidelity** — `restore(save(data).id)` deep-equals `data` for any JSON value
    - Feature: json-editor-overhaul, Property 10
    - _Requirements: 15.3_

- [x] 8. Implement `differ.ts`
  - [x] 8.1 Create `app/lib/differ.ts` with `summarizeDiff` and `lineDiff`
    - `summarizeDiff` counts top-level keys added, removed, modified between source and edited
    - `lineDiff` produces line-level diff entries (added/removed/unchanged) from two JSON strings
    - _Requirements: 10.2, 10.3_
  - [ ]* 8.2 Write property test: diff summary accuracy
    - **Property (differ)** — for any two JSON objects, `summarizeDiff` counts must equal the actual set differences of their top-level keys
    - Feature: json-editor-overhaul, differ correctness
    - _Requirements: 10.2_

- [x] 9. Checkpoint — ensure all module tests pass
  - Run `vitest --run` and confirm all tests pass.

- [x] 10. Build the core React UI in `app/page.tsx`
  - Replace existing `page.tsx` with a clean implementation wiring all lib modules
  - State: `sourceData`, `workingData`, `filename`, `undoStack` (max 10), `scanResult`, `lastSortReport`, `log` (OperationLog instance), `snapshots` (SnapshotStore instance), `isBusy`, `busyMessage`
  - File load: call `parseJsonFile`, set source + working, reset undo stack, log "load" entry
  - Undo: pop from stack, restore working data, log "undo" entry
  - Validate: serialize working data, display pass/fail
  - Save: validate then trigger browser download as `{filename}_edited.json` with 2-space indent
  - _Requirements: 1.1, 1.3, 2.2, 2.3, 2.6, 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [ ] 11. Add sort UI, scoped sort, and Movement Log panel
  - [ ] 11.1 Add sort controls: container path input (populated from scan results), sort key input, direction toggle, Sort button
    - On sort: call `sortContainer`, push pre-sort state to undo stack, update working data, log entry, display Sort Report
    - _Requirements: 4.1, 4.11, 5.1, 5.2, 5.3, 5.4, 5.5_
  - [ ] 11.2 Add Movement Log panel displayed after each sort
    - Render a scrollable table: `[old index] line {from} → line {to}  key: {value}` for every element
    - Show header: container path, sort key, direction, timestamp, total element count
    - Panel must NOT truncate — all rows must be rendered (use virtualized list for large datasets)
    - Add "Download Movement Log" button that triggers plain-text file download
    - Retain the panel when sort is undone so the user can still review it
    - _Requirements: 16.6, 16.7, 16.8, 16.9, 16.10_
  - [ ] 11.3 Add scoped sort: allow user to type or select a sub-path; sort applies only to that path
    - Validate selected path resolves to a Sortable Container before enabling Sort button
    - Log scoped path in Operation Log entry
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_
  - [ ]* 11.4 Write property test: scoped sort isolation
    - **Property 8: Scoped sort isolation** — for any scoped sort on path P, all nodes at paths not prefixed by P are reference-equal in the result
    - Feature: json-editor-overhaul, Property 8
    - _Requirements: 13.2_

- [ ] 12. Add manual editor, sanitization UI, and large-file warning
  - [ ] 12.1 Add text editor area showing Working JSON; on commit parse and update working data or show inline error with line/col
    - Show unsaved-edits indicator while text differs from working data
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  - [ ] 12.2 Add Unix-safe sanitize button; call `sanitizeUnixSafe`, push undo, update working data, log entry, show modification count
    - _Requirements: 9.1, 9.6, 9.7_
  - [ ] 12.3 Add large-file warning: if file > 5 MB, show confirmation dialog before loading
    - _Requirements: 2.5_

- [ ] 13. Add Operation Log panel and Snapshot UI
  - [ ] 13.1 Add scrollable Operation Log panel displaying all log entries with timestamp, operation, status
    - Add "Download Log" button that calls `log.exportText()` and triggers browser download
    - _Requirements: 14.4, 14.5_
  - [ ] 13.2 Add Snapshot controls: name input, Save Snapshot button, list of saved snapshots (most recent first) each with a Restore button
    - Save: call `snapshots.save`, log entry
    - Restore: push current working data to undo stack, call `snapshots.restore`, update working data, log entry
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7_

- [ ] 14. Add source vs. edited comparison panel
  - Display Source JSON and Working JSON side by side with clear labels
  - Show `summarizeDiff` result (added/removed/modified top-level keys) as a summary badge
  - Add "Show Diff" toggle that renders `lineDiff` output with color-coded added/removed lines
  - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [ ] 15. Add virtualized rendering for large files
  - Replace any direct JSON-to-DOM rendering with a virtualized list component (e.g. `react-window` or `react-virtual`)
  - Only visible lines rendered to DOM
  - _Requirements: 11.4_

- [ ] 16. Add progress indicator and cancel for long-running operations
  - Show elapsed time and Cancel button for any operation running > 2 seconds
  - On cancel: discard partial result, restore pre-operation working data, log cancelled entry
  - _Requirements: 11.2, 11.3_

- [ ] 17. Final checkpoint — ensure all tests pass and app is functional
  - Run `vitest --run` and confirm all tests pass.
  - Verify file load, sort with Sort Report, scoped sort, undo, sanitize, snapshot save/restore, log download, and save all work end-to-end.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- All pure-function modules in `app/lib/` must have zero imports from React or Next.js
- The undo stack max depth is 10 entries
- Snapshots are in-memory only — not persisted to localStorage
- Sort never uses a timeout; it runs to completion regardless of duration
