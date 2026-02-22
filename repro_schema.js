const fs = require('fs');
const path = require('path');

function isObject(val) {
    return val !== null && typeof val === "object" && !Array.isArray(val);
}

function isArray(val) {
    return Array.isArray(val);
}

// Helper to merge fields from multiple observations of the same schema node
function mergeFields(existing, newFields) {
    if (!newFields) return existing;
    if (!existing) return newFields;
    const merged = new Set(existing);
    newFields.forEach(f => merged.add(f));
    return Array.from(merged).sort();
}

function extractArrayFields(arr) {
    const fieldSets = [];
    arr.forEach((item) => {
        if (isObject(item)) {
            const fields = new Set();
            Object.keys(item).forEach((key) => fields.add(key));
            // Recurse strictly for "fields" (simple paths)
            Object.entries(item).forEach(([key, value]) => {
                if (isObject(value)) {
                    Object.keys(value).forEach((nestedKey) => fields.add(`${key}.${nestedKey}`));
                } else if (Array.isArray(value) && value.length > 0 && isObject(value[0])) {
                    Object.keys(value[0]).forEach((nestedKey) => fields.add(`${key}.${nestedKey}`));
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
    // Map<SchemaPath, { count, type, depth, samplePath, availableFields }>
    const schemaMap = new Map();
    let maxDepth = 0;

    function traverse(value, path, schemaPath, depth) {
        maxDepth = Math.max(maxDepth, depth);

        if (isArray(value)) {
            const availableFields = extractArrayFields(value);

            // Register Schema Node
            if (!schemaMap.has(schemaPath)) {
                schemaMap.set(schemaPath, {
                    path: schemaPath, // Logical Path
                    type: 'array',
                    depth,
                    count: 1,
                    samplePath: path, // One real path for reference
                    availableFields
                });
            } else {
                const info = schemaMap.get(schemaPath);
                info.count++;
                info.availableFields = mergeFields(info.availableFields, availableFields);
            }

            // Recurse children (Array items are merged into one recursion step)
            value.forEach((item, idx) => {
                traverse(item, path ? `${path}[${idx}]` : `[${idx}]`, `${schemaPath}[]`, depth + 1);
            });

        } else if (isObject(value)) {
            const keys = Object.keys(value);

            // Dictionary Detection
            let isDictionary = false;
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
                if (objectCount > 0 && objectCount === sampleCount) {
                    isDictionary = true;
                    availableFields = extractArrayFields(objects);
                }
            }

            // Register Schema Node
            if (!schemaMap.has(schemaPath)) {
                schemaMap.set(schemaPath, {
                    path: schemaPath || 'root',
                    type: 'object',
                    isDictionary,
                    depth,
                    count: 1,
                    samplePath: path || 'root',
                    availableFields: availableFields.length > 0 ? availableFields : undefined
                });
            } else {
                const info = schemaMap.get(schemaPath);
                info.count++;
                if (isDictionary) info.isDictionary = true;
                if (availableFields.length > 0) {
                    info.availableFields = mergeFields(info.availableFields, availableFields);
                }
            }

            // Recurse
            keys.forEach((key) => {
                const child = value[key];
                const newPath = path ? `${path}.${key}` : key;

                // If Dictionary, keys are dynamic -> wildcard
                // If Static Object, keys are structural -> literal
                const childSchemaKey = isDictionary ? '*' : key;
                const newSchemaPath = schemaPath ? `${schemaPath}.${childSchemaKey}` : childSchemaKey;

                traverse(child, newPath, newSchemaPath, depth + 1);
            });
        }
    }

    traverse(data, "", "", 0);

    // Convert Map to Containers List
    const containers = Array.from(schemaMap.values()).sort((a, b) => a.path.localeCompare(b.path));
    return { containers, maxDepth };
}

// --- Test ---
const testData = {
    "view": {
        "name": "Fruit Catalog",
        "classes": {
            "pear": {
                "productDesc": "European pears",
                "attributes": [
                    { "name": "Conference", "details": { "origin": "Belgium" } }
                ]
            },
            "mango": {
                "productDesc": "Tropical mangoes",
                "attributes": [
                    { "name": "Kent", "details": { "origin": "Peru" } }
                ]
            },
            "banana": {
                "productDesc": "Tropical bananas",
                "attributes": [
                    { "name": "Cavendish" }
                ]
            }
        }
    }
};

console.log("Analyzing Schema...");
const result = analyzeJsonStructure(testData);
result.containers.forEach(c => {
    console.log(`[${c.type}] ${c.path} (x${c.count}) ${c.isDictionary ? 'DICTIONARY' : ''}`);
    if (c.availableFields) console.log(`   Fields: ${c.availableFields.join(', ')}`);
});
