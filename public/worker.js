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

function extractArrayFields(arr) {
    const fieldSets = [];

    arr.forEach((item) => {
        if (isObject(item)) {
            const fields = new Set();
            Object.keys(item).forEach((key) => fields.add(key));
            Object.entries(item).forEach(([key, value]) => {
                if (isObject(value)) {
                    Object.keys(value).forEach((nestedKey) => {
                        fields.add(`${key}.${nestedKey}`);
                    });
                }
            });
            fieldSets.push(fields);
        }
    });

    if (fieldSets.length === 0) return [];

    const allFields = new Set();
    fieldSets.forEach((fieldSet) => {
        fieldSet.forEach((field) => allFields.add(field));
    });

    return Array.from(allFields).sort();
}

function analyzeJsonStructure(data) {
    const containers = [];
    let maxDepth = 0;

    function traverse(value, path, depth) {
        maxDepth = Math.max(maxDepth, depth);

        if (isArray(value)) {
            const availableFields = extractArrayFields(value);
            containers.push({
                path: path || "root",
                type: "array",
                depth,
                itemCount: value.length,
                availableFields,
            });

            value.forEach((item, idx) => {
                traverse(item, path ? `${path}[${idx}]` : `[${idx}]`, depth + 1);
            });
        } else if (isObject(value)) {
            const keys = Object.keys(value);
            containers.push({
                path: path || "root",
                type: "object",
                depth,
                itemCount: keys.length,
            });

            keys.forEach((key) => {
                const newPath = path ? `${path}.${key}` : key;
                traverse(value[key], newPath, depth + 1);
            });
        }
    }

    traverse(data, "", 0);
    return { containers, maxDepth };
}

function getSortableContainers(analysis) {
    return analysis.containers.filter((c) => c.itemCount > 0);
}

function getAllPaths(analysis) {
    const paths = new Set();
    analysis.containers.forEach(c => {
        if (c.path && c.path !== 'root') {
            const cleanPath = c.path.replace(/\[.*?\]/g, '');
            if (cleanPath && !cleanPath.includes('[')) {
                paths.add(cleanPath);
            }
        }
    });
    return Array.from(paths).sort();
}

function evaluatePath(data, path) {
    if (!path || path === "root") return data;
    const parts = path.split(/\.|\[/).map((p) => p.replace(/\]$/, ""));
    let current = data;
    for (const part of parts) {
        if (!part) continue;
        if (current === null || typeof current !== "object") return null;
        if (isArray(current)) {
            const idx = parseInt(part, 10);
            if (isNaN(idx) || idx >= current.length) return null;
            current = current[idx];
        } else {
            current = current[part];
        }
    }
    return current;
}

function getFieldValue(obj, fieldPath) {
    if (!fieldPath || fieldPath === "(keys)") return obj;
    const parts = fieldPath.split(".");
    let current = obj;
    for (const part of parts) {
        if (!part) continue;
        if (current === null || typeof current !== "object") return null;
        if (isArray(current)) {
            const idx = 0;
            if (idx >= current.length) return null;
            current = current[idx];
        }
        current = current[part];
    }
    if (isArray(current) && current.length > 0) return current[0];
    return current;
}

// ==========================================
// LINEAGE MAPPING
// ==========================================

function buildLineMap(jsonString, data) {
    const map = new Map();
    const lines = jsonString.split(/\r\n|\n|\r/);

    // We traverse the Data and find it in the Text
    // This ensures we map the parsed structure correctly.
    // 'cursor' tracks our position in the string (line, col) to avoid backtracking

    let currentLine = 0;

    // Helper to find text starting from currentLine
    function findLineOf(searchTerm) {
        // Search first 500 characters of each line to avoid hanging on minified/huge lines
        // But for "json formatted" files, lines are usually short.
        for (let i = currentLine; i < lines.length; i++) {
            const idx = lines[i].indexOf(searchTerm);
            if (idx !== -1) {
                currentLine = i; // Move cursor forward
                return i + 1; // 1-based
            }
        }
        return -1;
    }

    function traverse(obj, path) {
        if (isArray(obj)) {
            // For arrays, the array itself starts at `[` which we might have passed
            // We iterate items.
            obj.forEach((item, idx) => {
                const itemPath = path ? `${path}[${idx}]` : `[${idx}]`;

                if (isObject(item)) {
                    // Object in array usually starts with {
                    // We don't map the object root, but its keys. 
                    // But we should find the `{` to advance cursor?
                    findLineOf('{');
                    traverse(item, itemPath);
                } else {
                    // Primitive in array
                    const valStr = JSON.stringify(item);
                    const line = findLineOf(valStr);
                    if (line !== -1) map.set(itemPath, line);
                }
            });
        } else if (isObject(obj)) {
            // Traverse keys
            Object.keys(obj).forEach(key => {
                const keyPath = path ? `${path}.${key}` : key;
                // Find key: "key":
                const line = findLineOf(`"${key}"`);
                if (line !== -1) {
                    map.set(keyPath, line);
                    // Also map the object itself if needed? 
                    // UI usually requests path of the Key.
                }
                traverse(obj[key], keyPath);
            });
        }
    }

    // Heuristic: If we start with {, find it
    if (jsonString.trim().startsWith('{')) findLineOf('{');
    else if (jsonString.trim().startsWith('[')) findLineOf('[');

    traverse(data, "");
    return map;
}

// ==========================================
// WORKER MESSAGE HANDLER
// ==========================================

self.onmessage = function (e) {
    const { type, data, lineMap, jsonString } = e.data;

    try {
        if (type === 'ANALYZE') {
            const analysis = analyzeJsonStructure(data);
            const containers = getSortableContainers(analysis);
            const allPaths = getAllPaths(analysis);

            // Build Line Map if jsonString is provided (Initial Load)
            let newLineMap = lineMap; // Use existing if passed
            if (jsonString) {
                newLineMap = buildLineMap(jsonString, data);
            }

            // Pre-calculate options to save main thread work
            const containerOptions = [];
            const protectedContainers = [];

            containers.forEach(container => {
                if (container.path.includes('[')) return;
                protectedContainers.push(container);

                if (container.type === 'array' && container.availableFields) {
                    container.availableFields.forEach(field => {
                        containerOptions.push({
                            ...container,
                            path: `${container.path}.${field}`,
                            availableFields: [field]
                        });
                    });
                } else if (container.type === 'object') {
                    containerOptions.push(container);
                }
            });

            // For protected paths dropdown
            const protectedPathsList = allPaths.map(path => ({
                path,
                type: 'object',
                depth: 0,
                itemCount: 0
            }));

            self.postMessage({
                success: true,
                type: 'ANALYZE_RESULT',
                result: {
                    structureAnalysis: analysis,
                    containerOptions,
                    protectedContainers: protectedPathsList,
                    lineMap: newLineMap // Send back the map
                }
            });
        }

        else if (type === 'SORT') {
            const { containerPath, sortField, sortDirection } = e.data;
            const updated = JSON.parse(JSON.stringify(data));
            const container = evaluatePath(updated, containerPath);

            if (!container) throw new Error(`Container path "${containerPath}" not found`);

            let itemCount = 0;
            let moves = new Map(); // oldIndex -> newIndex

            if (Array.isArray(container)) {
                itemCount = container.length;

                // Add original index tracking
                const tracked = container.map((item, index) => ({ item, index }));

                tracked.sort((a, b) => {
                    let valA = sortField ? getFieldValue(a.item, sortField) : a.item;
                    let valB = sortField ? getFieldValue(b.item, sortField) : b.item;

                    const strA = String(valA ?? '');
                    const strB = String(valB ?? '');
                    const numA = parseFloat(strA);
                    const numB = parseFloat(strB);

                    if (!isNaN(numA) && !isNaN(numB)) {
                        return sortDirection === "asc" ? numA - numB : numB - numA;
                    }
                    return sortDirection === "asc" ? strA.localeCompare(strB) : strB.localeCompare(strA);
                });

                // Apply sort to container and record moves
                for (let i = 0; i < tracked.length; i++) {
                    container[i] = tracked[i].item;
                    moves.set(tracked[i].index, i);
                }

            } else if (typeof container === 'object' && container !== null) {
                // Object sort is just reordering keys, paths don't change indices
                // So lineMap stays mostly valid, but visual order changes.
                // However, our lineMap keys are strict paths.
                // root.obj.a -> line 10. root.obj.b -> line 11.
                // If we sort keys, 'a' is still 'root.obj.a'.
                // So for Objects, NO lineMap update is needed!

                const keys = Object.keys(container).sort((a, b) =>
                    sortDirection === "asc" ? a.localeCompare(b) : b.localeCompare(a)
                );
                itemCount = keys.length;
                const sorted = {};
                keys.forEach(k => sorted[k] = container[k]);

                // Update parent
                const parts = containerPath.split(/\.|\[/).map(p => p.replace(/\]$/, ''));
                let parent = updated;
                for (let i = 0; i < parts.length - 1; i++) {
                    parent = parent[parts[i]];
                }
                parent[parts[parts.length - 1]] = sorted;
            }

            // Rebuild Line Map with moves (Only if Array sorted)
            let newLineMap = lineMap;
            if (moves.size > 0 && lineMap) {
                newLineMap = new Map();
                // O(MapSize) - iterate once and translate paths
                for (const [path, line] of lineMap.entries()) {
                    if (path.startsWith(containerPath) && path.includes('[')) {
                        // Check if this path is affected by the sort
                        // path format: containerPath[index]...
                        const relPath = path.substring(containerPath.length); // e.g., "[5].id"
                        const match = relPath.match(/^\[(\d+)\](.*)/);

                        if (match) {
                            const oldIndex = parseInt(match[1], 10);
                            const suffix = match[2];

                            if (moves.has(oldIndex)) {
                                const newIndex = moves.get(oldIndex);
                                const newPath = `${containerPath}[${newIndex}]${suffix}`;
                                newLineMap.set(newPath, line);
                            } else {
                                // Index outside of sorted range? Should not happen if sorting whole array
                                newLineMap.set(path, line);
                            }
                        } else {
                            newLineMap.set(path, line);
                        }
                    } else {
                        newLineMap.set(path, line);
                    }
                }
            }

            self.postMessage({
                success: true,
                type: 'SORT_RESULT',
                result: updated,
                lineMap: newLineMap,
                itemCount
            });
        }

    } catch (error) {
        self.postMessage({
            success: false,
            error: error.message
        });
    }
};

function isObject(val) {
    return val !== null && typeof val === "object" && !Array.isArray(val);
}

function isArray(val) {
    return Array.isArray(val);
}

function extractArrayFields(arr) {
    const fieldSets = [];

    arr.forEach((item) => {
        if (isObject(item)) {
            const fields = new Set();
            Object.keys(item).forEach((key) => fields.add(key));
            Object.entries(item).forEach(([key, value]) => {
                if (isObject(value)) {
                    Object.keys(value).forEach((nestedKey) => {
                        fields.add(`${key}.${nestedKey}`);
                    });
                }
            });
            fieldSets.push(fields);
        }
    });

    if (fieldSets.length === 0) return [];

    const allFields = new Set();
    fieldSets.forEach((fieldSet) => {
        fieldSet.forEach((field) => allFields.add(field));
    });

    return Array.from(allFields).sort();
}

function analyzeJsonStructure(data) {
    const containers = [];
    let maxDepth = 0;

    function traverse(value, path, depth) {
        maxDepth = Math.max(maxDepth, depth);

        if (isArray(value)) {
            const availableFields = extractArrayFields(value);
            containers.push({
                path: path || "root",
                type: "array",
                depth,
                itemCount: value.length,
                availableFields,
            });

            value.forEach((item, idx) => {
                traverse(item, path ? `${path}[${idx}]` : `[${idx}]`, depth + 1);
            });
        } else if (isObject(value)) {
            const keys = Object.keys(value);
            containers.push({
                path: path || "root",
                type: "object",
                depth,
                itemCount: keys.length,
            });

            keys.forEach((key) => {
                const newPath = path ? `${path}.${key}` : key;
                traverse(value[key], newPath, depth + 1);
            });
        }
    }

    traverse(data, "", 0);
    return { containers, maxDepth };
}

function getSortableContainers(analysis) {
    return analysis.containers.filter((c) => c.itemCount > 0);
}

function getAllPaths(analysis) {
    const paths = new Set();
    analysis.containers.forEach(c => {
        if (c.path && c.path !== 'root') {
            const cleanPath = c.path.replace(/\[.*?\]/g, '');
            if (cleanPath && !cleanPath.includes('[')) {
                paths.add(cleanPath);
            }
        }
    });
    return Array.from(paths).sort();
}

function evaluatePath(data, path) {
    if (!path || path === "root") return data;
    const parts = path.split(/\.|\[/).map((p) => p.replace(/\]$/, ""));
    let current = data;
    for (const part of parts) {
        if (!part) continue;
        if (current === null || typeof current !== "object") return null;
        if (isArray(current)) {
            const idx = parseInt(part, 10);
            if (isNaN(idx) || idx >= current.length) return null;
            current = current[idx];
        } else {
            current = current[part];
        }
    }
    return current;
}

function getFieldValue(obj, fieldPath) {
    if (!fieldPath || fieldPath === "(keys)") return obj;
    const parts = fieldPath.split(".");
    let current = obj;
    for (const part of parts) {
        if (!part) continue;
        if (current === null || typeof current !== "object") return null;
        if (isArray(current)) {
            const idx = 0;
            if (idx >= current.length) return null;
            current = current[idx];
        }
        current = current[part];
    }
    if (isArray(current) && current.length > 0) return current[0];
    return current;
}

// ==========================================
// WORKER MESSAGE HANDLER
// ==========================================

self.onmessage = function (e) {
    const { type, data } = e.data;

    try {
        if (type === 'ANALYZE') {
            const analysis = analyzeJsonStructure(data);
            const containers = getSortableContainers(analysis);
            const allPaths = getAllPaths(analysis);

            // Pre-calculate options to save main thread work
            const containerOptions = [];
            const protectedContainers = [];

            containers.forEach(container => {
                if (container.path.includes('[')) return;
                protectedContainers.push(container);

                if (container.type === 'array' && container.availableFields) {
                    container.availableFields.forEach(field => {
                        containerOptions.push({
                            ...container,
                            path: `${container.path}.${field}`,
                            availableFields: [field]
                        });
                    });
                } else if (container.type === 'object') {
                    containerOptions.push(container);
                }
            });

            // For protected paths dropdown
            const protectedPathsList = allPaths.map(path => ({
                path,
                type: 'object',
                depth: 0,
                itemCount: 0
            }));

            self.postMessage({
                success: true,
                type: 'ANALYZE_RESULT',
                result: {
                    structureAnalysis: analysis,
                    containerOptions,
                    protectedContainers: protectedPathsList
                }
            });
        }

        else if (type === 'SORT') {
            const { containerPath, sortField, sortDirection, lineMap } = e.data;
            const updated = JSON.parse(JSON.stringify(data));
            const container = evaluatePath(updated, containerPath);

            if (!container) throw new Error(`Container path "${containerPath}" not found`);

            let itemCount = 0;
            let moves = new Map(); // oldIndex -> newIndex

            if (Array.isArray(container)) {
                itemCount = container.length;

                // Track original indices to map moves
                const tracked = container.map((item, index) => ({ item, index }));

                tracked.sort((a, b) => {
                    let valA = sortField ? getFieldValue(a.item, sortField) : a.item;
                    let valB = sortField ? getFieldValue(b.item, sortField) : b.item;

                    const strA = String(valA ?? '');
                    const strB = String(valB ?? '');
                    const numA = parseFloat(strA);
                    const numB = parseFloat(strB);

                    if (!isNaN(numA) && !isNaN(numB)) {
                        return sortDirection === "asc" ? numA - numB : numB - numA;
                    }
                    return sortDirection === "asc" ? strA.localeCompare(strB) : strB.localeCompare(strA);
                });

                // Apply sort
                for (let i = 0; i < tracked.length; i++) {
                    container[i] = tracked[i].item;
                    moves.set(tracked[i].index, i);
                }

            } else if (typeof container === 'object' && container !== null) {
                const keys = Object.keys(container).sort((a, b) =>
                    sortDirection === "asc" ? a.localeCompare(b) : b.localeCompare(a)
                );
                itemCount = keys.length;
                const sorted = {};
                keys.forEach(k => sorted[k] = container[k]);

                const parts = containerPath.split(/\.|\[/).map(p => p.replace(/\]$/, ''));
                let parent = updated;
                for (let i = 0; i < parts.length - 1; i++) {
                    parent = parent[parts[i]];
                }
                parent[parts[parts.length - 1]] = sorted;
            }

            // Rebuild Line Map with moves (Only if Array sorted)
            let newLineMap = lineMap;
            // Optimization checking: root array paths start with '[' not 'root['
            const isRoot = containerPath === 'root';
            const rangePrefix = isRoot ? '[' : (containerPath + '[');

            if (moves.size > 0 && lineMap) {
                newLineMap = new Map();
                for (const [path, line] of lineMap.entries()) {
                    // Check if path is inside the sorted container
                    if (path.startsWith(rangePrefix)) {
                        // Extract relative path to identify index: [5].id
                        const relPath = isRoot ? path : path.substring(containerPath.length);
                        const match = relPath.match(/^\[(\d+)\](.*)/);

                        if (match) {
                            const oldIndex = parseInt(match[1], 10);
                            const suffix = match[2];

                            if (moves.has(oldIndex)) {
                                const newIndex = moves.get(oldIndex);
                                const newPath = isRoot
                                    ? `[${newIndex}]${suffix}`
                                    : `${containerPath}[${newIndex}]${suffix}`;
                                newLineMap.set(newPath, line);
                            } else {
                                newLineMap.set(path, line);
                            }
                        } else {
                            newLineMap.set(path, line);
                        }
                    } else {
                        newLineMap.set(path, line);
                    }
                }
            }

            self.postMessage({
                success: true,
                type: 'SORT_RESULT',
                result: updated,
                lineMap: newLineMap,
                itemCount
            });
        }

    } catch (error) {
        self.postMessage({
            success: false,
            error: error.message
        });
    }
};
