const fs = require('fs');
const path = require('path');

// 1. Read worker.js content
const workerPath = path.join(__dirname, 'public', 'worker.js');
let workerCode = fs.readFileSync(workerPath, 'utf8');

// 2. Mock environment to run worker code
// remove 'importScripts' if any (none in this file)
// Wrap in a function to execute
const api = {
    postMessage: (msg) => {
        // console.log("[Worker Output]", msg); 
        if (!msg.success) {
            console.error("Worker Error:", msg.error);
        }
        if (msg.type === 'ANALYZE_RESULT') {
            global.analyzeResult = msg;
        } else if (msg.type === 'SORT_RESULT') {
            global.sortResult = msg;
        }
    }
};

const self = api;

// Evaluate worker code
eval(workerCode);

// 3. Generate Large Data (20k items)
const largeData = [];
for (let i = 0; i < 20000; i++) {
    largeData.push({
        id: i,
        name: `Item ${i}`,
        value: Math.random() * 1000,
        active: i % 2 === 0,
        details: {
            created: new Date().toISOString(),
            tags: ["a", "b", "c"]
        }
    });
}

const jsonString = JSON.stringify(largeData, null, 2);
console.log(`Generated JSON size: ${(jsonString.length / 1024 / 1024).toFixed(2)} MB`);

// 4. Test ANALYZE (Initial Line Map Build)
console.log("Starting ANALYZE (buildLineMap)...");
console.time("ANALYZE");
self.onmessage({
    data: {
        type: 'ANALYZE',
        data: largeData,
        jsonString: jsonString
    }
});
console.timeEnd("ANALYZE");

if (!global.analyzeResult) {
    console.error("ANALYZE failed to produce result");
    process.exit(1);
}

const lineMap = global.analyzeResult.result.lineMap;
console.log(`LineMap size: ${lineMap.size}`);

// Verify some lines
// largeData[0] starts at line 2 (line 1 is "[")
// largeData[0].id is at line 3
// Let's check logic.
// Verify map contents for a few paths
const checkPath = (p) => {
    const l = lineMap.get(p);
    // Find expected line in string
    // Simple verification: regex search in string to confirm
    /** 
     * Note: String search is slow, so we only do it for a few items to verify ONCE.
     */
    return l;
};

const line0 = checkPath("[0]");
console.log(`[0] starts at line: ${line0}`);

const line19999 = checkPath("[19999]");
console.log(`[19999] starts at line: ${line19999}`);

// 5. Test SORT
console.log("Starting SORT (update Line Map)...");
console.time("SORT");
self.onmessage({
    data: {
        type: 'SORT',
        data: largeData,
        containerPath: 'root', // root array
        sortField: 'id',
        sortDirection: 'desc', // Reverse order
        lineMap: lineMap
    }
});
console.timeEnd("SORT");

if (!global.sortResult) {
    console.error("SORT failed");
    process.exit(1);
}

const sortedMap = global.sortResult.lineMap;
// Verify sort
// After sort desc, [0] should be id=19999
// Original [19999] was id=19999. It was at line X.
// Now [0] is id=19999.
// The object CONTENT hasn't moved in the file (we didn't rewrite the string), 
// BUT the `lineMap` maps PATH -> LINE.
// Wait. `JsonEditor` uses `lineMap` to show line number of the item displayed.
// If I display `sorted[0]` (which is id=19999), I want to show the line number where id=19999 is defined.
// id=19999 is defined at `line19999`.
// So `sortedMap.get("[0]")` should return `line19999`.

const newLine0 = sortedMap.get("[0]");
console.log(`After Sort Desc: [0] (id=19999) should point to old line of [19999]`);
console.log(`New [0] line: ${newLine0}`);
console.log(`Expected: ${line19999}`);

if (newLine0 === line19999) {
    console.log("SUCCESS: Line Map updated correctly!");
} else {
    console.error("FAILURE: Line Map update incorrect.");
}
