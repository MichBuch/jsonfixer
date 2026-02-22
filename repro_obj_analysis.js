const fs = require('fs');
const path = require('path');

// --- Mock Worker Logic (copied from worker.js) ---

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
            // logic to extract fields from Valid "Collection" Objects? 
            // Currently missing!

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

// --- Test Data ---
const testData = {
    "view": {
        "name": "Fruit Catalog",
        "version": "1.0",
        "classes": {
            "pear": {
                "productDesc": "European pears",
                "attributes": [
                    {
                        "name": "Conference",
                        "vitaminC": "5%",
                        "colour": "green",
                        "edible": true,
                        "sourceCountry": "Belgium",
                        "fruitCode": "PR-CF-001"
                    }
                ]
            },
            "mango": {
                "productDesc": "Tropical mangoes",
                "attributes": [
                    {
                        "name": "Kent",
                        "vitaminC": "46%",
                        "colour": "yellow",
                        "edible": true,
                        "sourceCountry": "Peru",
                        "fruitCode": "MNG-KT-001"
                    }
                ]
            },
            "banana": {
                "productDesc": "Tropical bananas",
                "attributes": [
                    {
                        "name": "Cavendish",
                        "vitaminC": "15%",
                        "colour": "yellow",
                        "edible": true, "sourceCountry": "Ecuador",
                        "fruitCode": "BAN-CV-001"
                    }
                ]
            }
        }
    }
};

// --- Execution ---
console.log("Analyzing...");
const analysis = analyzeJsonStructure(testData);

// Simulate "worker.onmessage" handling where we generate options
const containerOptions = [];
analysis.containers.forEach(container => {
    if (container.type === 'array' && container.availableFields) {
        container.availableFields.forEach(field => {
            containerOptions.push({
                path: `${container.path}.${field}`,
                availableFields: [field]
            });
        });
    } else if (container.type === 'object') {
        containerOptions.push(container);
    }
});

console.log("Sortable Options Generated:");
containerOptions.forEach(o => {
    console.log(` - Path: ${o.path}  (Type: ${o.type})`);
});

// We expect "view.classes" to be listing fields like "productDesc" but failing that.
