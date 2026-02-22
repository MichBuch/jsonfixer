const fs = require('fs');

// --- Mock Worker Environment ---

function isObject(val) {
    return val !== null && typeof val === "object" && !Array.isArray(val);
}

function isArray(val) {
    return Array.isArray(val);
}

function getFieldValue(obj, fieldPath) {
    if (!obj) return undefined;
    const parts = fieldPath.split('.');
    let current = obj;
    for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
            current = current[part];
        } else {
            return undefined;
        }
    }
    return current;
}

// Copied from updated worker.js (relevant parts)
function resolveSchemaPaths(data, schemaPath) {
    const results = [];

    function traverse(current, parts, currentPath) {
        if (parts.length === 0) {
            results.push({ path: currentPath, value: current });
            return;
        }

        const part = parts[0];
        const remaining = parts.slice(1);
        const isArrayWildcard = part === '[*]';
        const isObjectWildcard = part === '*';

        if (isArrayWildcard) {
            if (Array.isArray(current)) {
                current.forEach((item, idx) => {
                    traverse(item, remaining, `${currentPath}[${idx}]`);
                });
            }
        } else if (isObjectWildcard) {
            if (isObject(current)) {
                Object.keys(current).forEach(key => {
                    traverse(current[key], remaining, `${currentPath}.${key}`);
                });
            }
        } else {
            if (current && typeof current === 'object' && part in current) {
                const nextPath = currentPath ? `${currentPath}.${part}` : part;
                traverse(current[part], remaining, nextPath);
            }
        }
    }

    const cleanParts = [];
    schemaPath.replace(/\[\*\]/g, '.[*]').split('.').forEach(p => {
        if (p) cleanParts.push(p);
    });

    traverse(data, cleanParts, "");
    return results;
}

function generateRegexFromSchema(schemaPath) {
    const parts = schemaPath.replace(/\[\*\]/g, '.[*]').split('.').filter(p => p);

    let regexStr = "^";
    const builders = [];

    parts.forEach((part, idx) => {
        if (part === '[*]') {
            regexStr += "\\[(\\d+)\\]";
            builders.push((captures) => `[${captures.shift()}]`);
        } else if (part === '*') {
            regexStr += "\\.([^\\.]+)";
            builders.push((captures) => `.${captures.shift()}`);
        } else {
            if (idx > 0 && !parts[idx - 1].startsWith('[')) regexStr += "\\.";
            regexStr += part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            builders.push(() => (idx > 0 && !parts[idx - 1].startsWith('[') ? `.${part}` : part));
        }
    });

    regexStr += "\\[(\\d+)\\]";

    const regex = new RegExp(regexStr);

    const captureMap = (match) => {
        const captures = Array.from(match).slice(1);
        captures.pop();
        let path = "";
        builders.forEach(b => path += b(captures));
        if (path.startsWith('.')) path = path.substring(1);
        return path;
    };

    return { regex, captureMap };
}

// Mock SORT handler logic
function performSort(data, lineMap, containerPath, sortField) {
    const updated = JSON.parse(JSON.stringify(data));
    const targets = resolveSchemaPaths(updated, containerPath);
    console.log(`[DEBUG] Found ${targets.length} targets for "${containerPath}"`);

    const allMoves = new Map();

    targets.forEach(({ path: targetPath, value: container }) => {
        console.log(`[DEBUG] Sorting target: ${targetPath}`);
        if (Array.isArray(container)) {
            const tracked = container.map((item, index) => ({ item, index }));
            tracked.sort((a, b) => {
                let valA = sortField ? getFieldValue(a.item, sortField) : a.item;
                let valB = sortField ? getFieldValue(b.item, sortField) : b.item;
                return String(valA).localeCompare(String(valB));
            });

            const moves = new Map();
            for (let i = 0; i < tracked.length; i++) {
                container[i] = tracked[i].item;
                moves.set(tracked[i].index, i);
            }
            allMoves.set(targetPath, moves);
        }
    });

    let newLineMap = new Map();
    if (lineMap) {
        const { regex, captureMap } = generateRegexFromSchema(containerPath);
        console.log(`[DEBUG] Regex: ${regex}`);

        for (const [path, line] of lineMap.entries()) {
            const match = path.match(regex);
            if (match) {
                const itemIdx = parseInt(match[match.length - 1], 10);
                const suffix = path.substring(match[0].length);
                const containerPathBuilder = captureMap(match);

                if (allMoves.has(containerPathBuilder)) {
                    const moves = allMoves.get(containerPathBuilder);
                    if (moves.has(itemIdx)) {
                        const newIdx = moves.get(itemIdx);
                        const newPath = `${containerPathBuilder}[${newIdx}]${suffix}`;
                        newLineMap.set(newPath, line);
                        console.log(`[DEBUG] Remapped: ${path} -> ${newPath}`);
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

    return updated;
}

// --- Test Execution ---

const testData = {
    "view": {
        "classes": {
            "pear": {
                "attributes": [
                    { "name": "B", "id": 1 },
                    { "name": "A", "id": 2 }
                ]
            },
            "mango": {
                "attributes": [
                    { "name": "D", "id": 3 },
                    { "name": "C", "id": 4 }
                ]
            }
        }
    }
};

const testLineMap = new Map([
    ["view.classes.pear.attributes[0].name", 10],
    ["view.classes.pear.attributes[1].name", 20],
    ["view.classes.mango.attributes[0].name", 30],
    ["view.classes.mango.attributes[1].name", 40]
]);

console.log("Sort 'view.classes.*.attributes' by 'name'...");
const res = performSort(testData, testLineMap, "view.classes.*.attributes", "name");

console.log("Result Pear:", res.view.classes.pear.attributes.map(i => i.name));
console.log("Result Mango:", res.view.classes.mango.attributes.map(i => i.name));
