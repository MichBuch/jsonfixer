# JSON Editor — Clean Slate Build Plan

## CRITICAL: Read This First

This project was copied from `C:\Lib\Dev\jsonfixer`. The UI (CSS, layout, colors, toolbar buttons) is CORRECT and must NOT be changed. The backend logic (worker.js, sort, analysis) needs to be rewritten cleanly.

## What Works (DO NOT TOUCH)
- `app/globals.css` — all styling, colors, borders, fonts
- `app/layout.tsx` — page layout
- `app/components/LoadingOverlay.tsx` — loading spinner
- `app/components/JsonEditor.tsx` — tree view editor
- `app/components/VirtualJsonNode.tsx` — tree node component
- `app/test-data.ts` — test data (fruit, cars, deep hierarchy)
- `public/test-data/` — JSON test files
- `in/` — sample input files including 10k element file
- Toolbar button styles: neon cyan border (`1px solid #00ffff`), `background: var(--border)`
- Panel layout: two panes, resizable, identical look at load time
- Color scheme: dark navy bg (#1a1a2e), gutter (#16213e), border (#0f3460)
- Syntax colors: keys #7dd3fc, strings #86efac, numbers #fcd34d, booleans #c084fc

## What Needs Rewriting

### 1. `app/components/VirtualSourceViewer.tsx` — BROKEN
The virtualized JSON viewer doesn't scroll. Needs rewrite using react-window v2 API.

**react-window v2 API (installed: 2.2.6):**
- Import: `import { List, RowComponentProps } from 'react-window'`
- NOT `FixedSizeList` — that's v1
- Row component receives `{ index, style, data }` via `RowComponentProps<T>`
- List props: `rowCount`, `rowHeight`, `rowComponent`, `rowProps`

**Requirements:**
- Line numbers in gutter (52px wide, bg #16213e, border-right 1px solid #0f3460)
- Syntax highlighting (same colors as above)
- Search highlighting (cyan bg on matching lines)
- Diff highlighting (amber bg on changed lines, right panel only)
- Must scroll with mousewheel, keyboard, scrollbar
- Expose ref with `scrollTo(scrollTop)` and `getScrollTop()` for sync scroll

### 2. `public/worker.js` — BROKEN ANALYSIS + SORT
The web worker handles structure analysis and sorting. Current code has duplicate functions and broken logic.

**ANALYSIS — `findSortablePaths(data)`:**

The algorithm must find all sortable paths in ANY JSON file. A sortable path is a location where multiple sibling elements can be reordered.

**Rules:**
- NEVER include data values in paths (no `view.classes.banana`)
- Use `.*` wildcard for dictionary keys (object where all values are objects)
- Use `[*]` wildcard for array indices
- For each container, also list `container.field` entries for every sortable field

**Example — Fruit Catalog structure:**
```
view                          <- structural object, recurse into keys
  name: "Fruit Catalog"      <- primitive, skip
  version: "1.0"             <- primitive, skip
  classes                     <- DICTIONARY (all values are objects: apple, banana...)
    apple                     <- data key (DO NOT add to paths)
      productDesc: "..."      <- primitive field of dictionary value
      attributes              <- ARRAY of objects
        [0] {name, vitaminC, colour, ...}
```

**Expected dropdown entries for fruit catalog:**
```
view.classes                          (sort 15 fruits by key name)
view.classes.productDesc              (sort 15 fruits by productDesc value)
view.classes.attributes.name          (sort 15 fruits by first attribute's name)
view.classes.attributes.vitaminC      (sort 15 fruits by first attribute's vitaminC)
view.classes.attributes.colour        (sort 15 fruits by first attribute's colour)
view.classes.attributes.edible        (sort 15 fruits by first attribute's edible)
view.classes.attributes.sourceCountry (sort 15 fruits by first attribute's sourceCountry)
view.classes.attributes.fruitCode     (sort 15 fruits by first attribute's fruitCode)
view.classes.attributes.fruitQuality  (sort 15 fruits by first attribute's fruitQuality)
view.classes.attributes.season        (sort 15 fruits by first attribute's season)
view.classes.attributes.packaging     (sort 15 fruits by first attribute's packaging)
view.classes.attributes.shelfLife     (sort 15 fruits by first attribute's shelfLife)
view.classes.*.attributes             (sort attributes WITHIN each fruit)
view.classes.*.attributes.name        (sort attributes within each fruit by name)
... etc
```

**Algorithm pseudocode:**
```
findSortablePaths(value, schemaPath):
  if ARRAY with items:
    record schemaPath as sortable container
    for each primitive field in items[0]:
      record schemaPath + "." + field
    recurse into items[0] with schemaPath + "[*]"

  if DICTIONARY (object, all values are objects):
    record schemaPath as sortable container (sort by key)
    for each primitive field in firstValue:
      record schemaPath + "." + field  (sort container by this field)
    recurse into firstValue with schemaPath + ".*"

  if STRUCTURAL OBJECT (not all values are objects):
    DO NOT record as sortable
    for each key where value is array/object:
      recurse with schemaPath + "." + key
```

**SORT — when user selects a path and clicks Sort:**

The selected path from dropdown is like `view.classes.attributes.fruitCode`.
This means: sort `view.classes` (the container) by field `attributes.fruitCode`.

The worker must:
1. Parse the selected path to find the CONTAINER and the SORT FIELD
2. Match against the containerOptions to get container path + sortField
3. Resolve wildcards if present (e.g., `view.classes.*.attributes` → sort each fruit's attributes)
4. Sort the container
5. Return the updated JSON

**`getFieldValue(obj, fieldPath)` must handle deep paths:**
- `"name"` → obj.name
- `"attributes.fruitCode"` → obj.attributes[0].fruitCode (auto-pick first array element)
- `"creator.name"` → obj.creator.name

### 3. `app/page.tsx` — NEEDS CLEANUP
The main page has accumulated dead code. Clean up:
- Remove unused imports (analyzeJsonStructure, getSortableContainers, etc from pathAnalyzer)
- Remove unused state variables (sortByPath, sortValuePath, lastSort, sortFieldOptions)
- The datalist should show the full sort path as value (e.g., `view.classes.attributes.fruitCode`)
- Sort button should match selected path against containerOptions to extract container + field
- Add scroll sync state and wiring

### 4. Scroll Sync Between Panels
- Add `scrollLocked` state (default: true)
- Add `🔗` toggle button in toolbar
- Both VirtualSourceViewer instances expose ref with scrollTo/getScrollTop
- On scroll in either panel, if locked, sync the other

### 5. Selective Sort Scope
- User can type a scope prefix (e.g., `view.classes.apple`)
- Sort only applies within that subtree
- Other entries remain untouched

### 6. Protected Paths
- Already has UI (🔒 Protected dropdown)
- Wire it so protected paths are excluded from sort

### 7. Movement Log
- Track every element that moved: old index, new index, key value
- Show inline scrollable panel after sort
- Download as text file

## Step-by-Step Execution Order

### Step 1: Install dependencies
```
cd C:\Lib\Dev\jsoneditor
npm install
```

### Step 2: Fix VirtualSourceViewer.tsx
Rewrite using correct react-window v2 API. Test that both panels render and scroll.

### Step 3: Rewrite worker.js
Clean implementation of findSortablePaths + sort. Test with fruit catalog:
- Scan → dropdown shows ~15 paths
- Sort view.classes A→Z → apple first, watermelon last
- Sort view.classes.attributes.fruitCode → banana (BAN) before pear (PR)

### Step 4: Clean up page.tsx
Remove dead code, wire datalist to new containerOptions format, fix sort button handler.

### Step 5: Add scroll sync
Wire refs, add toggle button.

### Step 6: Test with 10k element file
Load `in/10kelements.json`, verify scan + sort performance.

### Step 7: Wire remaining features
Protected paths, movement log, selective scope.

## UI Rules (NON-NEGOTIABLE)
- DO NOT change toolbar button styles
- DO NOT change color scheme
- DO NOT change font or line height
- Both panels MUST be pixel-identical at load time
- Gutter: 52px, bg #16213e, border-right 1px solid #0f3460, line numbers #4a5568
- Syntax: keys #7dd3fc, strings #86efac, numbers #fcd34d, booleans #c084fc
- Search highlight: cyan bg rgba(0,255,255,0.08)
- Diff highlight: amber bg rgba(227,179,65,0.10)
