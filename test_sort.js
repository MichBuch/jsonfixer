// Quick test to verify sort logic with fruit data

function isObject(val) {
    return val !== null && typeof val === "object" && !Array.isArray(val);
}
function isArray(val) {
    return Array.isArray(val);
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

const fruitClasses = {
    pear: {
        productDesc: "European pears",
        attributes: [{ name: "Conference", vitaminC: "5%", colour: "green", edible: true, sourceCountry: "Belgium", fruitCode: "PR-CF-001" }],
    },
    mango: {
        productDesc: "Tropical mangoes",
        attributes: [{ name: "Kent", vitaminC: "46%", colour: "yellow", edible: true, sourceCountry: "Peru", fruitCode: "MNG-KT-001" }],
    },
    banana: {
        productDesc: "Tropical bananas",
        attributes: [{ name: "Cavendish", vitaminC: "15%", colour: "yellow", edible: true, sourceCountry: "Ecuador", fruitCode: "BAN-CV-001" }],
    },
    apple: {
        productDesc: "Premium apple varieties",
        attributes: [
            { name: "Granny Smith", vitaminC: "12%", colour: "green", edible: true, sourceCountry: "Australia", fruitCode: "APL-GS-001" },
            { name: "Royal Gala", vitaminC: "8%", colour: "red", edible: true, sourceCountry: "New Zealand", fruitCode: "APL-RG-002" },
        ],
    },
    orange: {
        productDesc: "Citrus varieties",
        attributes: [{ name: "Valencia", vitaminC: "80%", colour: "orange", edible: true, sourceCountry: "Spain", fruitCode: "ORG-VL-001" }],
    },
};

// Test getFieldValue for each fruit
console.log("=== getFieldValue test for attributes.colour ===");
for (const [key, val] of Object.entries(fruitClasses)) {
    const colour = getFieldValue(val, "attributes.colour");
    console.log(`  ${key}: ${colour}`);
}

// Test sort by attributes.colour
const sortField = "attributes.colour";
const sortDirection = "asc";
const keys = Object.keys(fruitClasses).sort((a, b) => {
    const valA = getFieldValue(fruitClasses[a], sortField);
    const valB = getFieldValue(fruitClasses[b], sortField);
    const strA = String(valA ?? '');
    const strB = String(valB ?? '');
    return sortDirection === "asc" ? strA.localeCompare(strB) : strB.localeCompare(strA);
});

console.log("\n=== Sorted by colour (asc) ===");
keys.forEach(k => {
    const colour = getFieldValue(fruitClasses[k], sortField);
    console.log(`  ${k}: ${colour}`);
});

// Test sort by fruitCode
const sortField2 = "attributes.fruitCode";
const keys2 = Object.keys(fruitClasses).sort((a, b) => {
    const valA = getFieldValue(fruitClasses[a], sortField2);
    const valB = getFieldValue(fruitClasses[b], sortField2);
    const strA = String(valA ?? '');
    const strB = String(valB ?? '');
    return strA.localeCompare(strB);
});

console.log("\n=== Sorted by fruitCode (asc) ===");
keys2.forEach(k => {
    const code = getFieldValue(fruitClasses[k], sortField2);
    console.log(`  ${k}: ${code}`);
});
