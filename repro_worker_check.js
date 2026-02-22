const fs = require('fs');
const path = require('path');

// --- Worker Logic Copy ---

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

// --- Test Execution ---

const filePath = path.join(__dirname, 'in', '10kelements.json');
console.log(`Reading ${filePath}...`);

try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    console.log(`File read. Logic start...`);

    const start = Date.now();

    // Test Analysis
    console.log("Running analyzeJsonStructure...");
    const analysis = analyzeJsonStructure(data);

    const end = Date.now();

    console.log(`Analysis complete in ${end - start}ms.`);
    console.log(`Containers found: ${analysis.containers.length}`);

} catch (e) {
    console.error("Error:", e);
}
