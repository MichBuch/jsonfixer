/* eslint-disable no-restricted-globals */

// ==========================================
// UTILITY FUNCTIONS (Adapted from pathAnalyzer.ts)
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
            const { containerPath, sortField, sortDirection } = e.data;
            const updated = JSON.parse(JSON.stringify(data));
            const container = evaluatePath(updated, containerPath);

            if (!container) throw new Error(`Container path "${containerPath}" not found`);

            let itemCount = 0;

            if (Array.isArray(container)) {
                itemCount = container.length;
                container.sort((a, b) => {
                    let valA = sortField ? getFieldValue(a, sortField) : a;
                    let valB = sortField ? getFieldValue(b, sortField) : b;

                    const strA = String(valA ?? '');
                    const strB = String(valB ?? '');
                    const numA = parseFloat(strA);
                    const numB = parseFloat(strB);

                    if (!isNaN(numA) && !isNaN(numB)) {
                        return sortDirection === "asc" ? numA - numB : numB - numA;
                    }
                    return sortDirection === "asc" ? strA.localeCompare(strB) : strB.localeCompare(strA);
                });
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

            self.postMessage({
                success: true,
                type: 'SORT_RESULT',
                result: updated,
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
