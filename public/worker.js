/* eslint-disable no-restricted-globals */

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function isObject(val) {
    return val !== null && typeof val === "object" && !Array.isArray(val);
}

function isArray(val) {
    return Array.isArray(val);
}

// Extract sortable field paths from objects — includes paths through arrays/nested objects
// From {productDesc: "...", attributes: [{fruitCode: "...", name: "..."}]}
// Returns: ["productDesc", "attributes.fruitCode", "attributes.name", ...]
function extractSortableFields(items) {
    const allFields = new Set();
    items.forEach((item) => {
        if (!isObject(item)) return;
        Object.entries(item).forEach(([key, val]) => {
            if (val === null || typeof val !== "object") {
                // Primitive — directly sortable
                allFields.add(key);
            } else if (isArray(val) && val.length > 0) {
                const first = val[0];
                if (first !== null && typeof first === "object" && !isArray(first)) {
                    // Array of objects — expose nested primitive fields
                    Object.entries(first).forEach(([nk, nv]) => {
                        if (nv === null || typeof nv !== "object") {
                            allFields.add(`${key}.${nk}`);
                        }
                    });
                }
            } else if (isObject(val)) {
                // Nested object — one level deep
                Object.entries(val).forEach(([nk, nv]) => {
                    if (nv === null || typeof nv !== "object") {
                        allFields.add(`${key}.${nk}`);
                    }
                });
            }
        });
    });
    return Array.from(allFields).sort();
}

// ==========================================
// STRUCTURE ANALYSIS
// Produces schema-level paths only:
//   - view.classes          (dictionary object — sort keys alphabetically or by field)
//   - view.classes.*.attributes  (array inside each dictionary value)
// Never produces data-value paths like view.classes.pear
// ==========================================

/**
 * Detect whether an object is a dictionary (data-keyed) vs structural (schema-keyed).
 *
 * A dictionary has:
 *   1. Multiple keys (>1) — a single-key object is structural
 *   2. All values are objects (not primitives)
 *   3. Values share similar structure (>50% key overlap with the first value)
 *
 * Examples:
 *   { apple: {productDesc, attributes}, banana: {productDesc, attributes} } → dictionary ✓
 *   { cars: { porsche: {...}, audi: {...} } } → structural (only 1 key)
 *   { name: "Fruit", version: "1.0", classes: {...} } → structural (mixed value types)
 */
function detectDictionary(obj) {
    const keys = Object.keys(obj);
    if (keys.length < 2) return false; // Single-key objects are always structural

    const childVals = keys.map(k => obj[k]);
    // All values must be objects (not arrays, not primitives)
    if (!childVals.every(v => isObject(v) && !isArray(v))) return false;

    // Check structural similarity: values should share >50% of their keys
    const firstKeys = new Set(Object.keys(childVals[0]));
    if (firstKeys.size === 0) return false;

    for (let i = 1; i < childVals.length; i++) {
        const otherKeys = Object.keys(childVals[i]);
        const overlap = otherKeys.filter(k => firstKeys.has(k)).length;
        const similarity = overlap / Math.max(firstKeys.size, otherKeys.length);
        if (similarity < 0.5) return false;
    }

    return true;
}

function analyzeJsonStructure(data) {
    const containers = [];

    /**
     * @param value        - current node
     * @param schemaPath   - accumulated schema path (uses * for dictionary keys)
     * @param depth        - nesting depth
     * @param insideDictValue - true when we're inside a dictionary value template
     *                         (after a * wildcard). In this mode we only recurse into
     *                         arrays and nested dictionaries, NOT into every object key.
     */
    function traverse(value, schemaPath, depth, insideDictValue) {
        if (isArray(value)) {
            const fields = extractSortableFields(value);
            containers.push({
                path: schemaPath || "root",
                type: "array",
                depth,
                itemCount: value.length,
                availableFields: fields.length > 0 ? fields : undefined,
            });
            // Recurse into first item to find nested arrays/dictionaries
            if (value.length > 0 && isObject(value[0])) {
                // Inside an array item, look for nested containers
                Object.entries(value[0]).forEach(([key, child]) => {
                    if (isArray(child)) {
                        traverse(child, schemaPath ? `${schemaPath}.${key}` : key, depth + 1, false);
                    } else if (isObject(child) && detectDictionary(child)) {
                        traverse(child, schemaPath ? `${schemaPath}.${key}` : key, depth + 1, false);
                    }
                });
            }

        } else if (isObject(value)) {
            const isDictionary = detectDictionary(value);

            if (isDictionary) {
                const childVals = Object.keys(value).map(k => value[k]);
                const fields = extractSortableFields(childVals);
                containers.push({
                    path: schemaPath || "root",
                    type: "object",
                    isDictionary: true,
                    depth,
                    itemCount: Object.keys(value).length,
                    availableFields: fields.length > 0 ? fields : undefined,
                });
                // Recurse into first value with wildcard — mark as inside dict value
                const firstVal = value[Object.keys(value)[0]];
                traverse(firstVal, schemaPath ? `${schemaPath}.*` : "*", depth + 1, true);

            } else if (insideDictValue) {
                // We're inside a dictionary value template (e.g. inside "apple" after view.classes.*)
                // Do NOT record this as a container — it's a value template, not a sortable level.
                // Only recurse into arrays and nested dictionaries found in this template.
                Object.entries(value).forEach(([key, child]) => {
                    const childPath = schemaPath ? `${schemaPath}.${key}` : key;
                    if (isArray(child)) {
                        traverse(child, childPath, depth + 1, false);
                    } else if (isObject(child) && detectDictionary(child)) {
                        traverse(child, childPath, depth + 1, false);
                    }
                    // Skip plain objects — they're just nested fields, not containers
                });

            } else {
                // Structural object — keys are schema, not data
                containers.push({
                    path: schemaPath || "root",
                    type: "object",
                    isDictionary: false,
                    depth,
                    itemCount: Object.keys(value).length,
                });
                Object.entries(value).forEach(([key, child]) => {
                    const childPath = schemaPath ? `${schemaPath}.${key}` : key;
                    if (isArray(child) || isObject(child)) {
                        traverse(child, childPath, depth + 1, false);
                    }
                });
            }
        }
    }

    traverse(data, "", 0, false);
    return { containers };
}

// ==========================================
// PATH EVALUATION
// Supports wildcard * for dictionary keys:
//   view.classes.*.attributes -> sorts attributes in ALL fruit entries
// ==========================================

function evaluatePath(data, path) {
    if (!path || path === "root") return data;
    const parts = parsePath(path);
    let current = data;
    for (const part of parts) {
        if (current === null || current === undefined || typeof current !== "object") return null;
        if (part === "*") {
            // wildcard: return first value of object
            const keys = Object.keys(current);
            if (keys.length === 0) return null;
            current = current[keys[0]];
        } else if (isArray(current)) {
            const idx = parseInt(part, 10);
            if (isNaN(idx) || idx >= current.length) return null;
            current = current[idx];
        } else {
            if (!(part in current)) return null;
            current = current[part];
        }
    }
    return current;
}

// Resolve wildcard paths to ALL matching containers
// e.g. view.classes.*.attributes -> [{path: "view.classes.apple.attributes", value: [...]}, ...]
function resolveWildcardPath(data, schemaPath) {
    const parts = parsePath(schemaPath);
    const results = [];

    function walk(current, remaining, resolvedPath) {
        if (remaining.length === 0) {
            results.push({ path: resolvedPath, value: current });
            return;
        }
        if (current === null || current === undefined || typeof current !== "object") return;

        const part = remaining[0];
        const rest = remaining.slice(1);

        if (part === "*") {
            // expand all keys
            Object.keys(current).forEach(key => {
                walk(current[key], rest, resolvedPath ? `${resolvedPath}.${key}` : key);
            });
        } else if (part.startsWith("[") && part.endsWith("]")) {
            const idx = parseInt(part.slice(1, -1), 10);
            if (isArray(current) && idx < current.length) {
                walk(current[idx], rest, `${resolvedPath}[${idx}]`);
            }
        } else {
            if (isArray(current)) {
                // numeric index
                const idx = parseInt(part, 10);
                if (!isNaN(idx) && idx < current.length) {
                    walk(current[idx], rest, `${resolvedPath}[${idx}]`);
                }
            } else if (part in current) {
                walk(current[part], rest, resolvedPath ? `${resolvedPath}.${part}` : part);
            }
        }
    }

    walk(data, parts, "");
    return results;
}

function parsePath(path) {
    // "view.classes.*.attributes" -> ["view", "classes", "*", "attributes"]
    // "view.classes[0].name" -> ["view", "classes", "[0]", "name"]
    const parts = [];
    const re = /([^.[]+)|\[(\d+)\]/g;
    let m;
    while ((m = re.exec(path)) !== null) {
        if (m[1] !== undefined) parts.push(m[1]);
        else parts.push(`[${m[2]}]`);
    }
    return parts;
}

function getFieldValue(obj, fieldPath) {
    if (!fieldPath) return obj;
    const parts = fieldPath.split(".");
    let current = obj;
    for (const part of parts) {
        if (!part) continue;
        if (current === null || typeof current !== "object") return null;
        if (isArray(current)) { current = current[0]; if (current === undefined) return null; }
        current = current[part];
    }
    if (isArray(current) && current.length > 0) return current[0];
    return current;
}

function sortContainer(container, sortField, sortDirection) {
    if (isArray(container)) {
        container.sort((a, b) => {
            const valA = sortField ? getFieldValue(a, sortField) : a;
            const valB = sortField ? getFieldValue(b, sortField) : b;
            const strA = String(valA ?? '');
            const strB = String(valB ?? '');
            const numA = parseFloat(strA);
            const numB = parseFloat(strB);
            if (!isNaN(numA) && !isNaN(numB)) {
                return sortDirection === "asc" ? numA - numB : numB - numA;
            }
            return sortDirection === "asc" ? strA.localeCompare(strB) : strB.localeCompare(strA);
        });
        return { sorted: container, itemCount: container.length };
    } else if (isObject(container)) {
        const keys = Object.keys(container).sort((a, b) => {
            if (sortField) {
                const valA = getFieldValue(container[a], sortField);
                const valB = getFieldValue(container[b], sortField);
                const strA = String(valA ?? '');
                const strB = String(valB ?? '');
                const numA = parseFloat(strA);
                const numB = parseFloat(strB);
                if (!isNaN(numA) && !isNaN(numB)) {
                    return sortDirection === "asc" ? numA - numB : numB - numA;
                }
                return sortDirection === "asc" ? strA.localeCompare(strB) : strB.localeCompare(strA);
            }
            return sortDirection === "asc" ? a.localeCompare(b) : b.localeCompare(a);
        });
        const sorted = {};
        keys.forEach(k => sorted[k] = container[k]);
        return { sorted, itemCount: keys.length };
    }
    return { sorted: container, itemCount: 0 };
}

function setAtPath(root, resolvedPath, value) {
    const parts = parsePath(resolvedPath);
    let current = root;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (part.startsWith("[")) {
            current = current[parseInt(part.slice(1, -1), 10)];
        } else {
            current = current[part];
        }
        if (current === null || current === undefined) return;
    }
    const last = parts[parts.length - 1];
    if (last.startsWith("[")) {
        current[parseInt(last.slice(1, -1), 10)] = value;
    } else {
        current[last] = value;
    }
}

// ==========================================
// WORKER MESSAGE HANDLER
// ==========================================

self.onmessage = function (e) {
    const { type, data } = e.data;

    try {
        if (type === 'ANALYZE') {
            const analysis = analyzeJsonStructure(data);

            // Build full dropdown: each container + each of its sortable fields
            // e.g. "view.classes" (by key) + "view.classes.productDesc" + "view.classes.attributes.name" etc.
            const containerOptions = [];

            analysis.containers.forEach(c => {
                if (!c.path || c.path === 'root') return;
                // Skip paths with array indices — internal traversal artifacts
                if (c.path.includes('[')) return;
                // Skip non-dictionary structural objects — they're not sortable containers
                if (c.type === 'object' && !c.isDictionary) return;

                // Base entry: sort container by key/index
                containerOptions.push({
                    path: c.path,
                    type: c.type,
                    itemCount: c.itemCount,
                    sortField: null,
                });

                // One entry per sortable field
                if (c.availableFields) {
                    c.availableFields.forEach(field => {
                        containerOptions.push({
                            path: c.path,
                            type: c.type,
                            itemCount: c.itemCount,
                            sortField: field,
                        });
                    });
                }
            });

            console.log("[worker] ANALYZE:", containerOptions.length, "sort options");

            // Deduplicate by display path (container.sortField)
            const seen = new Set();
            const uniqueOptions = containerOptions.filter(c => {
                const key = c.sortField ? `${c.path}.${c.sortField}` : c.path;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });

            const allPaths = [...new Set(uniqueOptions.map(c => c.path))].sort();
            const protectedPathsList = allPaths.map(path => ({
                path, type: 'object', depth: 0, itemCount: 0
            }));

            self.postMessage({
                success: true,
                type: 'ANALYZE_RESULT',
                result: {
                    structureAnalysis: analysis,
                    containerOptions: uniqueOptions,
                    protectedContainers: protectedPathsList,
                },
            });
        }

        // ==========================================
        // SORT_VIEWNAME
        // Bulletproof sort: view → classes[] → attributes[] → by viewname ASC
        // Rules:
        //   1. ONLY touches view.classes[n].attributes — nothing else
        //   2. Classes stay in their original order
        //   3. Each attribute object moves as a whole unit (all properties intact)
        //   4. Pre/post integrity check: attribute count per class must match
        //   5. Safe for 300k+ line files — shallow clone root, deep clone only classes
        // ==========================================
        else if (type === 'SORT_VIEWNAME') {
            // Step 1: Validate structure on original data
            if (!data || typeof data !== 'object') throw new Error('Data is not an object');
            if (!data.view || typeof data.view !== 'object') throw new Error('Missing "view" at root');
            if (!Array.isArray(data.view.classes)) throw new Error('view.classes is not an array');

            // Step 2: Shallow clone root + view, deep clone ONLY classes array
            var clone = Object.assign({}, data);
            clone.view = Object.assign({}, data.view);
            clone.view.classes = JSON.parse(JSON.stringify(data.view.classes));
            var classes = clone.view.classes;

            // Step 3: Pre-sort integrity snapshot
            var preSnapshot = [];
            for (var ci = 0; ci < classes.length; ci++) {
                var cls = classes[ci];
                var attrs = (cls && Array.isArray(cls.attributes)) ? cls.attributes : null;
                preSnapshot.push({
                    className: cls ? cls.name : null,
                    attrCount: attrs ? attrs.length : 0,
                    attrKeys: attrs ? attrs.map(function(a) { return a && a.name ? a.name : '??'; }).sort() : []
                });
            }

            // Step 4: Sort — ONLY attributes arrays, by viewname, within each class
            var totalSorted = 0;
            for (var si = 0; si < classes.length; si++) {
                var sortCls = classes[si];
                if (!sortCls || !Array.isArray(sortCls.attributes)) continue;
                sortCls.attributes.sort(function(a, b) {
                    var va = (a && a.viewname != null) ? String(a.viewname) : '';
                    var vb = (b && b.viewname != null) ? String(b.viewname) : '';
                    return va.localeCompare(vb);
                });
                totalSorted += sortCls.attributes.length;
            }

            // Step 5: Post-sort integrity check
            var errors = [];
            for (var pi = 0; pi < classes.length; pi++) {
                var postCls = classes[pi];
                var postAttrs = (postCls && Array.isArray(postCls.attributes)) ? postCls.attributes : null;
                var postCount = postAttrs ? postAttrs.length : 0;
                var postKeys = postAttrs ? postAttrs.map(function(a) { return a && a.name ? a.name : '??'; }).sort() : [];

                if (postCount !== preSnapshot[pi].attrCount) {
                    errors.push('Class[' + pi + '] "' + preSnapshot[pi].className + '": count ' + preSnapshot[pi].attrCount + ' -> ' + postCount);
                }
                if (JSON.stringify(postKeys) !== JSON.stringify(preSnapshot[pi].attrKeys)) {
                    errors.push('Class[' + pi + '] "' + preSnapshot[pi].className + '": attribute names changed');
                }
            }

            if (errors.length > 0) {
                throw new Error('INTEGRITY FAILURE: ' + errors.join('; '));
            }

            console.log('[worker] SORT_VIEWNAME done — ' + totalSorted + ' attributes across ' + classes.length + ' classes, integrity OK');

            self.postMessage({
                success: true,
                type: 'SORT_RESULT',
                result: clone,
                itemCount: totalSorted,
            });
        }

        // ==========================================
        // SORT_TX
        // Sort attributes within each class according to an external order file.
        // The order file has lines: "className", "viewname"
        // Attributes are reordered to match that sequence exactly.
        // Attributes NOT in the order file are appended at the end (original order).
        // Classes stay in their original order. No data is lost.
        //
        // Performance (optimized for 2k+ order rows, 300k+ line JSON):
        //   - Order file → Map<className, Map<viewname, position>> — O(1) lookup
        //   - Only view.classes is deep-cloned, not the entire JSON tree
        //   - Sort is O(N log N) per class, attribute lookup O(1) via position map
        //   - Integrity: pre/post attribute count + name set comparison per class
        // ==========================================
        else if (type === 'SORT_TX') {
            var txOrderText = e.data.orderText;
            if (!txOrderText || typeof txOrderText !== 'string') {
                throw new Error('SORT_TX: orderText is missing');
            }

            // Step 1: Parse order file into Map<className, Map<viewname, position>>
            var txLines = txOrderText.split(/\r?\n/);
            var txOrderMap = {};  // { className: { viewname: positionIndex } }
            var txParsedCount = 0;
            for (var li = 0; li < txLines.length; li++) {
                var raw = txLines[li].trim();
                if (!raw || raw.toLowerCase().indexOf('class') === 0) continue;
                var qm = raw.match(/"([^"]*)"/g);
                if (!qm || qm.length < 2) continue;
                var txClass = qm[0].replace(/"/g, '').trim();
                var txView = qm[1].replace(/"/g, '').trim();
                if (!txClass || !txView) continue;
                if (!txOrderMap[txClass]) txOrderMap[txClass] = {};
                if (txOrderMap[txClass][txView] === undefined) {
                    txOrderMap[txClass][txView] = Object.keys(txOrderMap[txClass]).length;
                    txParsedCount++;
                }
            }

            var txClassNames = Object.keys(txOrderMap);
            if (txClassNames.length === 0) {
                throw new Error('SORT_TX: no valid sort entries found in order file');
            }
            console.log('[worker] SORT_TX parsed ' + txParsedCount + ' order entries across ' + txClassNames.length + ' classes');

            // Step 2: Shallow-clone root, deep-clone ONLY view.classes
            // This avoids stringify/parse of the entire 300k-line tree.
            // Everything outside view.classes is untouched — we spread the root
            // and view objects, then deep-clone just the classes array.
            if (!data || !data.view || !Array.isArray(data.view.classes)) {
                throw new Error('SORT_TX: expected view.classes to be an array');
            }
            var txClone = Object.assign({}, data);
            txClone.view = Object.assign({}, data.view);
            txClone.view.classes = JSON.parse(JSON.stringify(data.view.classes));
            var txClasses = txClone.view.classes;

            // Step 3: Pre-snapshot for integrity
            var txPre = [];
            for (var tpi = 0; tpi < txClasses.length; tpi++) {
                var tpc = txClasses[tpi];
                var tpa = (tpc && Array.isArray(tpc.attributes)) ? tpc.attributes : null;
                txPre.push({
                    name: tpc ? tpc.name : null,
                    count: tpa ? tpa.length : 0,
                    keys: tpa ? tpa.map(function(a) { return a && a.name ? a.name : '??'; }).sort() : []
                });
            }

            // Step 4: Sort each class's attributes using the position map
            var txTotalSorted = 0;
            var txUnmatched = 0;
            for (var tsi = 0; tsi < txClasses.length; tsi++) {
                var txCls = txClasses[tsi];
                if (!txCls || !Array.isArray(txCls.attributes)) continue;
                var posMap = txOrderMap[txCls.name];
                if (!posMap) continue;

                var tagged = [];
                for (var ai = 0; ai < txCls.attributes.length; ai++) {
                    var attr = txCls.attributes[ai];
                    var vn = (attr && attr.viewname != null) ? String(attr.viewname).trim() : '';
                    var pos = posMap[vn];
                    if (pos === undefined) {
                        pos = 1000000000 + ai;
                        txUnmatched++;
                    }
                    tagged.push({ attr: attr, pos: pos, origIdx: ai });
                }

                tagged.sort(function(a, b) {
                    if (a.pos !== b.pos) return a.pos - b.pos;
                    return a.origIdx - b.origIdx;
                });

                txCls.attributes = tagged.map(function(t) { return t.attr; });
                txTotalSorted += txCls.attributes.length;
            }

            // Step 5: Post-integrity check
            var txErrors = [];
            for (var tci = 0; tci < txClasses.length; tci++) {
                var txPostCls = txClasses[tci];
                var txPostAttrs = (txPostCls && Array.isArray(txPostCls.attributes)) ? txPostCls.attributes : null;
                var txPostCount = txPostAttrs ? txPostAttrs.length : 0;
                var txPostKeys = txPostAttrs ? txPostAttrs.map(function(a) { return a && a.name ? a.name : '??'; }).sort() : [];
                if (txPostCount !== txPre[tci].count) {
                    txErrors.push('Class[' + tci + '] "' + txPre[tci].name + '": count ' + txPre[tci].count + ' -> ' + txPostCount);
                }
                if (JSON.stringify(txPostKeys) !== JSON.stringify(txPre[tci].keys)) {
                    txErrors.push('Class[' + tci + '] "' + txPre[tci].name + '": attribute names changed');
                }
            }
            if (txErrors.length > 0) {
                throw new Error('SORT_TX INTEGRITY FAILURE: ' + txErrors.join('; '));
            }

            console.log('[worker] SORT_TX done — ' + txTotalSorted + ' attrs reordered (' + txUnmatched + ' unmatched appended), integrity OK');

            self.postMessage({
                success: true,
                type: 'SORT_RESULT',
                result: txClone,
                itemCount: txTotalSorted,
            });
        }

        else if (type === 'SORT') {
            let { containerPath, sortField, sortDirection } = e.data;

            console.log(`[worker] SORT input — path:"${containerPath}" field:"${sortField ?? ''}" dir:"${sortDirection}"`);

            // Smart path resolution: if containerPath doesn't point to a container,
            // walk the path to find the deepest sortable container and use the rest as sortField.
            // This handles both dropdown selections AND manually typed paths.
            if (!containerPath.includes('*')) {
                const resolved = evaluatePath(data, containerPath);
                if (resolved === null || resolved === undefined || typeof resolved !== 'object') {
                    // containerPath doesn't point to a container — try splitting it
                    const parts = containerPath.split('.');
                    let bestContainerIdx = -1;
                    let node = data;
                    for (let i = 0; i < parts.length; i++) {
                        if (node === null || node === undefined || typeof node !== 'object') break;
                        node = isArray(node) ? node : node[parts[i]];
                        if (node !== null && node !== undefined && typeof node === 'object') {
                            // This is a valid container (array or object with multiple keys)
                            if (isArray(node) || Object.keys(node).length > 1) {
                                bestContainerIdx = i;
                            }
                        }
                    }
                    if (bestContainerIdx >= 0) {
                        const newContainerPath = parts.slice(0, bestContainerIdx + 1).join('.');
                        const newSortField = parts.slice(bestContainerIdx + 1).join('.');
                        console.log(`[worker] SORT resolved: container="${newContainerPath}" field="${newSortField}"`);
                        containerPath = newContainerPath;
                        sortField = newSortField || sortField;
                    }
                }
            }

            const updated = JSON.parse(JSON.stringify(data));
            const hasWildcard = containerPath.includes('*');

            let totalItems = 0;

            if (hasWildcard) {
                // Resolve wildcard to all matching containers and sort each
                const targets = resolveWildcardPath(updated, containerPath);
                if (targets.length === 0) {
                    throw new Error(`No containers found matching "${containerPath}"`);
                }
                targets.forEach(({ path: resolvedPath, value: container }) => {
                    const { sorted, itemCount } = sortContainer(container, sortField, sortDirection);
                    totalItems += itemCount;
                    setAtPath(updated, resolvedPath, sorted);
                });
            } else {
                // Direct path
                const container = evaluatePath(updated, containerPath);
                if (container === null || container === undefined) {
                    throw new Error(
                        `Container path "${containerPath}" not found. ` +
                        `Run "Scan Structure" first and pick a path from the dropdown.`
                    );
                }
                const { sorted, itemCount } = sortContainer(container, sortField, sortDirection);
                totalItems = itemCount;
                if (isArray(container)) {
                    // array was sorted in-place — but we need to write it back since we deep-cloned
                    setAtPath(updated, containerPath, sorted);
                } else {
                    setAtPath(updated, containerPath, sorted);
                }
            }

            console.log(`[worker] SORT done — ${totalItems} items, path:"${containerPath}" field:"${sortField ?? '(keys)'}"`);

            self.postMessage({
                success: true,
                type: 'SORT_RESULT',
                result: updated,
                itemCount: totalItems,
            });
        }

    } catch (error) {
        console.error('[worker] error:', error.message);
        self.postMessage({ success: false, type: type === 'SORT' ? 'SORT_RESULT' : 'ANALYZE_RESULT', error: error.message });
    }
};
