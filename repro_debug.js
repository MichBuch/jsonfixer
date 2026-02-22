const fs = require('fs');
const path = require('path');

// --- Mock Worker Logic ---

function isObject(val) {
    return val !== null && typeof val === "object" && !Array.isArray(val);
}

function isArray(val) {
    return Array.isArray(val);
}

function extractArrayFields(arr) {
    const fieldSets = [];
    console.log(`[DEBUG] Extracting fields from ${arr.length} items...`);
    arr.forEach((item, idx) => {
        if (isObject(item)) {
            const fields = new Set();
            Object.keys(item).forEach((key) => fields.add(key));
            Object.entries(item).forEach(([key, value]) => {
                if (isObject(value)) {
                    Object.keys(value).forEach((nestedKey) => {
                        fields.add(`${key}.${nestedKey}`);
                    });
                } else if (Array.isArray(value) && value.length > 0) {
                    const first = value[0];
                    if (isObject(first)) {
                        Object.keys(first).forEach((nestedKey) => {
                            fields.add(`${key}.${nestedKey}`);
                        });
                    }
                }
            });
            console.log(`[DEBUG] Item ${idx} fields:`, Array.from(fields));
            fieldSets.push(fields);
        }
    });

    if (fieldSets.length === 0) return [];

    // Union of all fields
    const allFields = new Set();
    fieldSets.forEach((fieldSet) => {
        fieldSet.forEach((field) => allFields.add(field));
    });

    return Array.from(allFields).sort();
}

function analyzeJsonStructure(data) {
    const containers = [];

    function traverse(value, path, depth) {
        if (isArray(value)) {
            const availableFields = extractArrayFields(value);
            containers.push({
                path: path || "root",
                type: "array",
                availableFields,
            });
            value.forEach((item, idx) => {
                traverse(item, path ? `${path}[${idx}]` : `[${idx}]`, depth + 1);
            });
        } else if (isObject(value)) {
            const keys = Object.keys(value);

            // Dictionary Check
            let availableFields = [];
            if (keys.length > 0) {
                const sampleCount = Math.min(keys.length, 10);
                let objectCount = 0;
                const objects = [];
                for (let i = 0; i < sampleCount; i++) {
                    const val = value[keys[i]];
                    if (isObject(val)) {
                        objectCount++;
                        objects.push(val);
                    }
                }

                console.log(`[DEBUG] Object "${path}" has ${keys.length} keys. Sampled ${sampleCount}, found ${objectCount} objects.`);

                if (objectCount > 0 && objectCount === sampleCount) {
                    availableFields = extractArrayFields(objects);
                    console.log(`[DEBUG] Derived fields for "${path}":`, availableFields);
                }
            }

            containers.push({
                path: path || "root",
                type: "object",
                availableFields: availableFields.length > 0 ? availableFields : undefined
            });

            keys.forEach((key) => {
                const newPath = path ? `${path}.${key}` : key;
                traverse(value[key], newPath, depth + 1);
            });
        }
    }

    traverse(data, "", 0);
    return { containers };
}

// --- Test Data ---
const testData = {
    "view": {
        "name": "Fruit Catalog",
        "classes": {
            "pear": {
                "productDesc": "European pears",
                "attributes": [{ "name": "Conference" }]
            },
            "mango": {
                "productDesc": "Tropical mangoes",
                "attributes": [{ "name": "Kent" }]
            }
        }
    }
};

// --- Execution ---
console.log("Analyzing...");
const analysis = analyzeJsonStructure(testData);

const containerOptions = [];
analysis.containers.forEach(container => {
    if (container.type === 'object') {
        containerOptions.push({ path: container.path, type: 'object' });
        if (container.availableFields) {
            container.availableFields.forEach(field => {
                containerOptions.push({
                    path: `${container.path}.${field}`,
                    type: 'field'
                });
            });
        }
    }
});

console.log("Sortable Options Generated:");
containerOptions.forEach(o => {
    console.log(` - Path: ${o.path}  (Type: ${o.type})`);
});
