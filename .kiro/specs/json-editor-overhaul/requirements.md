# Requirements Document

## Introduction

This document specifies the overhaul of the JSON editor/processor application. The existing app has critical reliability failures: sort operations silently lose data, large files hang the UI, there is no audit trail for changes, and an unnecessary authentication layer adds complexity without value. The overhaul replaces the current implementation with a trustworthy, local-only tool suitable for processing sensitive corporate JSON data. The guiding principles are **correctness and verifiability over features**, and **accuracy over speed** — it is acceptable for an operation to take a long time provided the output is guaranteed correct.

## Glossary

- **App**: The JSON editor/processor Next.js application being overhauled.
- **Source JSON**: The original JSON content loaded from a file, held immutably for comparison.
- **Working JSON**: The in-memory copy of the JSON that the user edits and sorts.
- **Sortable Container**: A JSON array whose elements are objects sharing at least one common key, making them sortable by that key.
- **Sort Key**: The object property name used as the basis for sorting a Sortable Container.
- **Sort Report**: A structured summary produced after every sort operation, showing element counts before and after, the sort key used, direction, and whether counts match.
- **Element Count**: The number of direct children in a Sortable Container.
- **Unix-Safe String**: A string value that has been sanitized to escape or remove characters that would cause issues in Unix shell environments (unescaped double quotes, unescaped backslashes, bare newlines, null bytes, and non-printable control characters).
- **Validation**: The process of verifying that the Working JSON is well-formed, parseable JSON.
- **Undo Stack**: A bounded history of Working JSON states that allows reverting recent changes.
- **Structure Scan**: The process of traversing the Working JSON to identify all Sortable Containers and their available Sort Keys.
- **Scoped Sort**: A sort operation applied only to the Sortable Container at or beneath a user-selected path in the JSON tree, leaving all other parts of the Working JSON unchanged.
- **Operation Log**: A persistent, append-only record of every operation performed on the Working JSON during a session, including loads, sorts, edits, sanitizations, and saves.
- **Movement Log**: A detailed, per-element record produced by every sort operation, listing each element's original line number and new line number after sorting. Intended to provide irrefutable evidence of what moved where.
- **Snapshot**: A named, saved copy of the Working JSON state that the user can restore at any time without losing subsequent snapshots.

---

## Requirements

### Requirement 1: Local-Only Processing

**User Story:** As a user handling sensitive corporate data, I want all processing to happen entirely in my browser with no network calls, so that my data never leaves my machine.

#### Acceptance Criteria

1. THE App SHALL perform all JSON parsing, sorting, editing, and saving operations entirely within the browser process, without making any network requests.
2. THE App SHALL NOT transmit any portion of the loaded JSON data to any external server or third-party service.
3. THE App SHALL function fully without an internet connection after the initial page load.
4. THE App SHALL NOT include any authentication, license-checking, or trial-expiry logic.
5. THE App SHALL be accessible immediately on load without any login screen or access gate.

---

### Requirement 2: JSON File Loading

**User Story:** As a user, I want to load a JSON file from my local filesystem, so that I can inspect and process its contents.

#### Acceptance Criteria

1. WHEN a user selects a local file via the file picker, THE App SHALL read the file contents entirely within the browser using the FileReader API.
2. WHEN a file is successfully parsed, THE App SHALL store an immutable copy as the Source JSON and a mutable copy as the Working JSON.
3. WHEN a file is successfully loaded, THE App SHALL display the filename and the total top-level element count.
4. WHEN a file cannot be parsed as valid JSON, THE App SHALL display a descriptive parse error message and SHALL NOT update the Working JSON.
5. WHEN a JSON file exceeds 5 MB in size, THE App SHALL display a warning to the user before loading and SHALL proceed only upon user confirmation.
6. WHEN a JSON file is loaded, THE App SHALL reset the Undo Stack to empty.

---

### Requirement 3: Structure Scan

**User Story:** As a user, I want the app to scan my JSON and identify all sortable arrays, so that I can choose what to sort without manually inspecting the structure.

#### Acceptance Criteria

1. WHEN a user triggers a Structure Scan, THE App SHALL traverse the Working JSON and identify all Sortable Containers.
2. WHEN a Sortable Container is identified, THE App SHALL record its dot-notation path and the list of Sort Keys available across its elements.
3. WHEN a Structure Scan completes, THE App SHALL display the list of discovered Sortable Containers with their paths and available Sort Keys.
4. WHEN a Structure Scan is in progress on a large dataset, THE App SHALL remain responsive and SHALL provide a visible progress indicator.
5. WHEN a Structure Scan is cancelled by the user, THE App SHALL stop processing and restore the UI to its pre-scan state without data loss.
6. IF the Working JSON contains no Sortable Containers, THEN THE App SHALL inform the user that no sortable arrays were found.

---

### Requirement 4: Sort Operation

**User Story:** As a user, I want to sort a JSON array by a chosen key and direction, so that I can organize my data predictably.

#### Acceptance Criteria

1. WHEN a user initiates a sort, THE App SHALL require a valid Sortable Container path and a Sort Key to be specified before executing.
2. WHEN a sort is initiated, THE App SHALL record the Element Count of the target Sortable Container before sorting begins.
3. WHEN a sort completes, THE App SHALL verify that the Element Count of the sorted container equals the pre-sort Element Count.
4. IF the post-sort Element Count does not equal the pre-sort Element Count, THEN THE App SHALL reject the sort result, restore the pre-sort Working JSON, and display an error message identifying the count discrepancy.
5. WHEN a sort completes successfully, THE App SHALL update the Working JSON with the sorted result.
6. WHEN a sort completes successfully, THE App SHALL push the pre-sort Working JSON state onto the Undo Stack.
7. WHEN sorting by key in ascending order, THE App SHALL order elements such that their Sort Key values are in locale-aware ascending alphabetical order.
8. WHEN sorting by key in descending order, THE App SHALL order elements such that their Sort Key values are in locale-aware descending alphabetical order.
9. WHEN sorting by a numeric Sort Key, THE App SHALL compare values numerically, not lexicographically.
10. WHEN elements have an identical Sort Key value, THE App SHALL preserve their original relative order (stable sort).
11. WHEN a sort is in progress, THE App SHALL display a visible loading indicator and SHALL prevent concurrent sort operations.

---

### Requirement 5: Sort Report

**User Story:** As a user, I want a clear confirmation of what the sort did, so that I can verify the operation was correct before saving.

#### Acceptance Criteria

1. WHEN a sort completes (successfully or with an error), THE App SHALL display a Sort Report.
2. THE Sort Report SHALL include: the container path sorted, the Sort Key used, the sort direction, the element count before the sort, the element count after the sort, and a pass/fail integrity status.
3. WHEN the Sort Report shows a count mismatch, THE App SHALL display the report with a visually distinct error state.
4. WHEN the Sort Report shows matching counts, THE App SHALL display the report with a visually distinct success state.
5. THE Sort Report SHALL remain visible until the user dismisses it or initiates another operation.

---

### Requirement 6: Manual JSON Editing

**User Story:** As a user, I want to manually edit the JSON text, so that I can make targeted corrections or additions.

#### Acceptance Criteria

1. THE App SHALL provide a text editor area displaying the Working JSON as formatted text.
2. WHEN a user modifies the text in the editor and commits the change, THE App SHALL attempt to parse the modified text as JSON.
3. WHEN the modified text is valid JSON, THE App SHALL update the Working JSON and push the previous state onto the Undo Stack.
4. WHEN the modified text is not valid JSON, THE App SHALL display an inline parse error with the line number and character position of the first error, and SHALL NOT update the Working JSON.
5. WHILE the editor contains unparsed text changes, THE App SHALL display a visual indicator that there are unsaved edits.

---

### Requirement 7: Undo

**User Story:** As a user, I want to undo recent changes, so that I can recover from mistakes without reloading the file.

#### Acceptance Criteria

1. THE App SHALL maintain an Undo Stack of at least the 10 most recent Working JSON states.
2. WHEN a user triggers undo, THE App SHALL restore the Working JSON to the most recent state on the Undo Stack and remove that state from the stack.
3. WHEN the Undo Stack is empty, THE App SHALL disable the undo action and display a visual indicator that there is nothing to undo.
4. WHEN a new Working JSON state is pushed onto a full Undo Stack, THE App SHALL discard the oldest entry to maintain the stack size limit.

---

### Requirement 8: Validation and Save

**User Story:** As a user, I want to validate and save my edited JSON, so that I can produce a correct output file.

#### Acceptance Criteria

1. WHEN a user triggers validation, THE App SHALL verify that the Working JSON can be serialized to a valid JSON string.
2. WHEN validation passes, THE App SHALL display a success indicator.
3. WHEN validation fails, THE App SHALL display a descriptive error message.
4. WHEN a user triggers save, THE App SHALL first validate the Working JSON and SHALL only proceed with the download if validation passes.
5. WHEN saving, THE App SHALL produce a downloadable file named `{original_filename}_edited.json`.
6. WHEN saving, THE App SHALL serialize the Working JSON with 2-space indentation.

---

### Requirement 9: Unix-Safe Output

**User Story:** As a user working in Unix environments, I want my saved JSON to be safe for use in shell scripts and pipelines, so that I don't encounter character-encoding or quoting issues.

#### Acceptance Criteria

1. WHEN a user requests Unix-safe output, THE App SHALL apply Unix-safe sanitization to all string values in the Working JSON before saving.
2. WHEN sanitizing, THE App SHALL escape all unescaped double-quote characters within string values.
3. WHEN sanitizing, THE App SHALL escape all unescaped backslash characters within string values.
4. WHEN sanitizing, THE App SHALL replace bare newline (`\n`) and carriage return (`\r`) characters within string values with their JSON escape sequences.
5. WHEN sanitizing, THE App SHALL remove null bytes and non-printable ASCII control characters (code points 0x00–0x1F, excluding `\t`, `\n`, `\r`) from string values.
6. WHEN sanitization is applied, THE App SHALL display a count of how many string values were modified.
7. WHEN sanitization is applied, THE App SHALL push the pre-sanitization Working JSON state onto the Undo Stack.
8. THE App SHALL NOT modify numeric, boolean, or null JSON values during sanitization.

---

### Requirement 10: Source vs. Edited Comparison

**User Story:** As a user, I want to compare the original file against my edited version, so that I have a clear audit trail of what changed.

#### Acceptance Criteria

1. THE App SHALL display the Source JSON and the Working JSON side by side.
2. WHEN both Source JSON and Working JSON are present, THE App SHALL compute and display a summary diff showing the number of top-level keys added, removed, or modified.
3. WHEN a user requests a detailed diff, THE App SHALL display a line-level comparison highlighting changed, added, and removed lines.
4. THE App SHALL clearly label which panel is the original source and which is the edited version.

---

### Requirement 11: Large File Performance

**User Story:** As a user with large JSON files, I want the app to process my data correctly even if it takes a long time, so that I can trust the output is accurate regardless of file size.

#### Acceptance Criteria

1. WHEN loading a JSON file, THE App SHALL parse the file without blocking the browser's main UI thread for more than 500ms.
2. WHEN performing a long-running operation (scan, sort, or sanitization), THE App SHALL display a progress indicator showing elapsed time and a cancel option.
3. WHEN a long-running operation is cancelled by the user, THE App SHALL stop processing, discard any partial result, and restore the Working JSON to its pre-operation state.
4. WHEN rendering the Working JSON in the editor, THE App SHALL use virtualized rendering so that only visible lines are rendered to the DOM.
5. THE App SHALL NOT impose a timeout on sort or scan operations; operations SHALL run to completion regardless of duration, provided the user has not cancelled.
6. WHEN a sort or scan operation completes after more than 5 seconds, THE App SHALL log the elapsed time in the Operation Log.

---

### Requirement 12: Architecture Simplicity

**User Story:** As a developer maintaining this tool, I want a simple, well-separated architecture, so that changes to one feature do not break others.

#### Acceptance Criteria

1. THE App SHALL separate sort logic, structure analysis logic, sanitization logic, and UI rendering into distinct modules with no circular dependencies.
2. THE App SHALL expose sort logic as a pure function that takes a JSON value and sort parameters and returns a new JSON value and a Sort Report, with no side effects.
3. THE App SHALL expose sanitization logic as a pure function that takes a JSON value and returns a sanitized JSON value and a modification count.
4. WHEN the sort module is modified, THE App's file loading, editing, and saving features SHALL continue to function without modification.
5. THE App SHALL NOT use a Web Worker for sort operations; sort SHALL execute synchronously on the main thread for datasets under 50,000 elements, and asynchronously via a Web Worker only for datasets exceeding that threshold.

---

### Requirement 13: Scoped Sort

**User Story:** As a user working with a large or complex JSON file, I want to sort only a specific subtree of the JSON by selecting a path, so that I can process data in chunks without affecting the rest of the structure.

#### Acceptance Criteria

1. WHEN a user selects a path within the JSON tree, THE App SHALL offer the option to perform a Scoped Sort limited to that path and its descendants.
2. WHEN a Scoped Sort is initiated, THE App SHALL apply the sort only to the Sortable Container at the selected path, leaving all sibling and ancestor nodes unchanged.
3. WHEN a Scoped Sort completes, THE App SHALL verify that the Element Count of the sorted container equals the pre-sort Element Count, using the same integrity check as a full sort.
4. WHEN a Scoped Sort completes successfully, THE App SHALL record the scoped path, Sort Key, direction, and element counts in the Operation Log.
5. WHEN a Scoped Sort completes successfully, THE App SHALL push the pre-sort Working JSON state onto the Undo Stack.
6. IF the selected path does not resolve to a Sortable Container, THEN THE App SHALL display an error message and SHALL NOT modify the Working JSON.

---

### Requirement 14: Operation Log

**User Story:** As a user processing sensitive data, I want a complete log of every operation performed during my session, so that I can review and audit exactly what changed.

#### Acceptance Criteria

1. THE App SHALL maintain an Operation Log for the duration of each session.
2. WHEN any of the following operations occurs, THE App SHALL append an entry to the Operation Log: file load, Structure Scan, sort (full or scoped), manual edit commit, sanitization, undo, snapshot save, snapshot restore, and file save.
3. EACH Operation Log entry SHALL include: a timestamp, the operation type, the relevant path or scope (where applicable), key parameters (sort key, direction, element counts), and a pass/fail status.
4. THE App SHALL display the Operation Log in a scrollable panel visible to the user during the session.
5. WHEN a user requests it, THE App SHALL allow the Operation Log to be downloaded as a plain-text file.
6. THE Operation Log SHALL be append-only; entries SHALL NOT be editable or deletable by the user.

---

### Requirement 15: Snapshots

**User Story:** As a user making a series of complex edits, I want to save named snapshots of my working state, so that I can roll back to any prior point without starting over from the original file.

#### Acceptance Criteria

1. WHEN a user saves a Snapshot, THE App SHALL store a copy of the current Working JSON associated with a user-provided name and a timestamp.
2. THE App SHALL allow the user to save multiple Snapshots during a session.
3. WHEN a user restores a Snapshot, THE App SHALL replace the Working JSON with the stored Snapshot copy and push the pre-restore state onto the Undo Stack.
4. WHEN a Snapshot is saved, THE App SHALL append an entry to the Operation Log recording the snapshot name and timestamp.
5. WHEN a Snapshot is restored, THE App SHALL append an entry to the Operation Log recording the snapshot name, timestamp, and the Working JSON state that was replaced.
6. THE App SHALL display the list of saved Snapshots with their names and timestamps, ordered from most recent to oldest.
7. WHEN a user restores a Snapshot, THE App SHALL NOT delete any other Snapshots; all Snapshots SHALL remain available for future restoration.
8. THE App SHALL store Snapshots in browser memory only; Snapshots SHALL NOT be persisted to disk automatically.

---

### Requirement 16: Movement Log

**User Story:** As a user processing sensitive corporate data, I want a detailed record of exactly where every element moved during a sort — including its original line number and new line number — so that I have irrefutable evidence of what changed and can verify no data was silently lost or misplaced.

#### Acceptance Criteria

1. WHEN a sort operation completes successfully, THE App SHALL produce a Movement Log for that sort.
2. EACH Movement Log entry SHALL record: the element's index before sorting, the element's index after sorting, the element's starting line number in the pre-sort JSON text, the element's ending line number in the post-sort JSON text, and the value of the Sort Key for that element.
3. THE Movement Log SHALL contain exactly one entry per element in the sorted container — no more, no fewer.
4. WHEN the element count before and after sorting are equal, THE App SHALL verify that the set of pre-sort indices in the Movement Log exactly matches the set of post-sort indices (i.e. a complete bijection with no duplicates or gaps).
5. IF the Movement Log index set verification fails, THE App SHALL treat this as an integrity failure, reject the sort result, restore the pre-sort Working JSON, and display an error.
6. THE App SHALL display the Movement Log in a scrollable panel after each sort, showing each row as: `[old index] line {from} → line {to}  key: {value}`.
7. WHEN a user requests it, THE App SHALL allow the Movement Log to be downloaded as a plain-text file, even if it is very large.
8. THE Movement Log file SHALL be human-readable and SHALL include a header line identifying the sort operation (container path, sort key, direction, timestamp).
9. THE App SHALL NOT truncate or summarise the Movement Log — every element movement SHALL be recorded regardless of the size of the dataset.
10. WHEN a sort is undone, THE App SHALL retain the Movement Log from the undone sort so the user can still review it.
