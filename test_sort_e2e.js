// End-to-end test simulating the EXACT worker SORT handler code path

function isObject(val) { return val !== null && typeof val === "object" && !Array.isArray(val); }
function isArray(val) { return Array.isArray(val); }

function parsePath(path) {
    const parts = [];
    const re = /([^.[]+)|\[(\d+)\]/g;
    let m;
    while ((m = re.exec(path)) !== null) {
        if (m[1] !== undefined) parts.push(m[1]);
        else parts.push(`[${m[2]}]`);
    }
    return parts;
}

function evaluatePath(data, path) {
    if (!path || path === "root") return data;
    const parts = parsePath(path);
    let current = data;
    for (const part of parts) {
        if (current === null || current === undefined || typeof current !== "object") return null;
        if (part === "*") {
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
            const strA = String(valA ?? ''); const strB = String(valB ?? '');
            const numA = parseFloat(strA); const numB = parseFloat(strB);
            if (!isNaN(numA) && !isNaN(numB)) return sortDirection === "asc" ? numA - numB : numB - numA;
            return sortDirection === "asc" ? strA.localeCompare(strB) : strB.localeCompare(strA);
        });
        return { sorted: container, itemCount: container.length };
    } else if (isObject(container)) {
        const keys = Object.keys(container).sort((a, b) => {
            if (sortField) {
                const valA = getFieldValue(container[a], sortField);
                const valB = getFieldValue(container[b], sortField);
                const strA = String(valA ?? ''); const strB = String(valB ?? '');
                const numA = parseFloat(strA); const numB = parseFloat(strB);
                if (!isNaN(numA) && !isNaN(numB)) return sortDirection === "asc" ? numA - numB : numB - numA;
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
        if (part.startsWith("[")) current = current[parseInt(part.slice(1, -1), 10)];
        else current = current[part];
        if (current === null || current === undefined) return;
    }
    const last = parts[parts.length - 1];
    if (last.startsWith("[")) current[parseInt(last.slice(1, -1), 10)] = value;
    else current[last] = value;
}

// ---- Simulate the EXACT worker SORT handler ----
function workerSort(data, inputContainerPath, inputSortField, sortDirection) {
    let containerPath = inputContainerPath;
    let sortField = inputSortField;

    // Smart path resolution
    if (!containerPath.includes('*')) {
        const resolved = evaluatePath(data, containerPath);
        if (resolved === null || resolved === undefined || typeof resolved !== 'object') {
            const parts = containerPath.split('.');
            let bestContainerIdx = -1;
            let node = data;
            for (let i = 0; i < parts.length; i++) {
                if (node === null || node === undefined || typeof node !== 'object') break;
                node = isArray(node) ? node : node[parts[i]];
                if (node !== null && node !== undefined && typeof node === 'object') {
                    if (isArray(node) || Object.keys(node).length > 1) {
                        bestContainerIdx = i;
                    }
                }
            }
            if (bestContainerIdx >= 0) {
                containerPath = parts.slice(0, bestContainerIdx + 1).join('.');
                sortField = parts.slice(bestContainerIdx + 1).join('.') || sortField;
            }
        }
    }

    const updated = JSON.parse(JSON.stringify(data));
    const container = evaluatePath(updated, containerPath);
    if (!container) return { error: `Container "${containerPath}" not found` };

    const { sorted, itemCount } = sortContainer(container, sortField, sortDirection);
    setAtPath(updated, containerPath, sorted);

    return { updated, containerPath, sortField, itemCount };
}

// ---- TEST DATA ----
const fruitCatalog = {
    view: {
        name: "Fruit Catalog", version: "1.0",
        classes: {
            pear: { productDesc: "European pears", attributes: [{ name: "Conference", vitaminC: "5%", colour: "green", fruitCode: "PR-CF-001" }] },
            mango: { productDesc: "Tropical mangoes", attributes: [{ name: "Kent", vitaminC: "46%", colour: "yellow", fruitCode: "MNG-KT-001" }] },
            banana: { productDesc: "Tropical bananas", attributes: [{ name: "Cavendish", vitaminC: "15%", colour: "yellow", fruitCode: "BAN-CV-001" }] },
            apple: { productDesc: "Premium apple varieties", attributes: [{ name: "Granny Smith", vitaminC: "12%", colour: "green", fruitCode: "APL-GS-001" }] },
            orange: { productDesc: "Citrus varieties", attributes: [{ name: "Valencia", vitaminC: "80%", colour: "orange", fruitCode: "ORG-VL-001" }] },
        }
    }
};

function runTest(label, inputPath, inputField, dir) {
    const result = workerSort(fruitCatalog, inputPath, inputField, dir);
    if (result.error) { console.log(`\n✗ ${label}: ${result.error}`); return; }
    
    const container = evaluatePath(result.updated, result.containerPath);
    const keys = Object.keys(container);
    console.log(`\n=== ${label} ===`);
    console.log(`  input: path="${inputPath}" field="${inputField ?? ''}" → resolved: container="${result.containerPath}" field="${result.sortField ?? '(keys)'}"`);
    keys.forEach(k => {
        const val = result.sortField ? getFieldValue(container[k], result.sortField) : k;
        console.log(`    ${k}: ${val}`);
    });
    
    // Verify
    let ok = true;
    for (let i = 1; i < keys.length; i++) {
        const prev = result.sortField ? String(getFieldValue(container[keys[i-1]], result.sortField) ?? '') : keys[i-1];
        const curr = result.sortField ? String(getFieldValue(container[keys[i]], result.sortField) ?? '') : keys[i];
        if (dir === "asc" ? prev.localeCompare(curr) > 0 : prev.localeCompare(curr) < 0) { ok = false; break; }
    }
    console.log(ok ? "  ✓ CORRECT" : "  ✗ WRONG ORDER");
}

// Test 1: Dropdown selection (containerPath already split correctly)
runTest("Dropdown: view.classes by key", "view.classes", null, "asc");
runTest("Dropdown: view.classes by colour", "view.classes", "attributes.colour", "asc");
runTest("Dropdown: view.classes by fruitCode", "view.classes", "attributes.fruitCode", "asc");

// Test 2: User types full path (no match in containerOptions, sortField=undefined)
runTest("Typed: view.classes.attributes.colour", "view.classes.attributes.colour", undefined, "asc");
runTest("Typed: view.classes.attributes.fruitCode", "view.classes.attributes.fruitCode", undefined, "asc");
runTest("Typed: view.classes.productDesc", "view.classes.productDesc", undefined, "asc");

// Test 3: User types just the container
runTest("Typed: view.classes (by key)", "view.classes", undefined, "asc");
