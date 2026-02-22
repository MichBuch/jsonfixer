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

function analyzeJsonStructure(data) {
    const containers = [];

    function traverse(value, schemaPath, depth) {
        if (isArray(value)) {
            const fields = extractSortableFields(value);
            containers.push({
                path: schemaPath || "root",
                type: "array",
                depth,
                itemCount: value.length,
                availableFields: fields.length > 0 ? fields : undefined,
            });
            // Recurse into first item to find nested containers
            if (value.length > 0 && (isObject(value[0]) || isArray(value[0]))) {
                traverse(value[0], schemaPath ? `${schemaPath}[0]` : "[0]", depth + 1);
            }

        } else if (isObject(value)) {
            const keys = Object.keys(value);

            // Dictionary detection: all values are objects (dynamic named keys = data, not schema)
            const childVals = keys.map(k => value[k]);
            const isDictionary = keys.length > 0 && childVals.every(isObject);

            if (isDictionary) {
                // Collect fields from dictionary values for sorting
                const fields = extractSortableFields(childVals);
                containers.push({
                    path: schemaPath || "root",
                    type: "object",
                    isDictionary: true,
                    depth,
                    itemCount: keys.length,
                    availableFields: fields.length > 0 ? fields : undefined,
                });
                // Recurse into first value using wildcard * to find nested containers
                // e.g. view.classes.* -> view.classes.*.attributes
                const firstVal = value[keys[0]];
                traverse(firstVal, schemaPath ? `${schemaPath}.*` : "*", depth + 1);

            } else {
                // Structural object — keys are schema, not data
                containers.push({
                    path: schemaPath || "root",
                    type: "object",
                    isDictionary: false,
                    depth,
                    itemCount: keys.length,
                });
                keys.forEach((key) => {
                    const child = value[key];
                    if (isArray(child) || isObject(child)) {
                        traverse(child, schemaPath ? `${schemaPath}.${key}` : key, depth + 1);
                    }
                });
            }
        }
    }

    traverse(data, "", 0);
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
