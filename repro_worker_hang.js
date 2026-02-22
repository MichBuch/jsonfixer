const fs = require('fs');
const path = require('path');

// --- EXACT Worker Logic for buildLineMap ---
// Copied from worker.js view in Step 327

function buildLineMap(jsonString) {
    const map = new Map();
    if (!jsonString) return map;

    const len = jsonString.length;
    let line = 1;

    // Stack to track current path context
    // Frame: { type: 'obj'|'arr', index: 0, key: null, expectingKey: boolean }
    const ctx = [];

    // State
    let inString = false;
    let isEscaped = false;
    let tokenStartLine = 1;
    let tokenStart = -1;

    for (let i = 0; i < len; i++) {
        const char = jsonString[i];

        if (char === '\n') {
            line++;
            continue;
        }

        // String state handling
        if (inString) {
            if (char === '\\' && !isEscaped) {
                isEscaped = true;
            } else if (char === '"' && !isEscaped) {
                inString = false;

                // String Token Complete
                // Determine if it's a Key, a Value, or an Array Item
                if (ctx.length > 0) {
                    const frame = ctx[ctx.length - 1];
                    const strVal = jsonString.substring(tokenStart + 1, i);

                    if (frame.type === 'obj') {
                        if (frame.expectingKey) {
                            // KEY detected
                            frame.key = strVal;
                            frame.expectingKey = false; // Next token is ":" then value

                            // Map this Key immediately
                            let currentPath = "";
                            for (const f of ctx) {
                                if (f.type === 'arr') currentPath += `[${f.index}]`;
                                else if (f.key) currentPath += `.${f.key}`;
                            }
                            if (currentPath.startsWith('.')) currentPath = currentPath.substring(1);

                            map.set(currentPath, tokenStartLine);
                        } else {
                            // VALUE detected (String in Object)
                            frame.key = null; // Reset key for next pair
                            // Expecting comma next
                        }
                    } else if (frame.type === 'arr') {
                        // ARRAY ITEM detected (String)
                        let currentPath = "";
                        for (const f of ctx) {
                            if (f.type === 'arr') currentPath += `[${f.index}]`;
                            else if (f.key) currentPath += `.${f.key}`;
                        }
                        if (currentPath.startsWith('.')) currentPath = currentPath.substring(1);

                        map.set(currentPath, tokenStartLine);
                        frame.index++;
                    }
                }
            } else {
                isEscaped = false;
            }
            continue;
        }

        // Start of String
        if (char === '"') {
            inString = true;
            tokenStart = i;
            tokenStartLine = line;
            isEscaped = false;
            continue;
        }

        // Structure Characters
        if (char === '{') {
            // Object Start
            // If inside array, map this object's position
            if (ctx.length > 0) {
                const frame = ctx[ctx.length - 1];
                if (frame.type === 'arr') {
                    let currentPath = "";
                    for (const f of ctx) {
                        if (f.type === 'arr') currentPath += `[${f.index}]`;
                        else if (f.key) currentPath += `.${f.key}`;
                    }
                    if (currentPath.startsWith('.')) currentPath = currentPath.substring(1);
                    // Decide if we map the object itself or just its keys.
                    // usually users want to jump to the start of the object item.
                    map.set(currentPath, line);
                }
            }
            ctx.push({ type: 'obj', index: 0, key: null, expectingKey: true });
        } else if (char === '}') {
            const frame = ctx.pop();
            // Object End
            // Advance parent container index/state
            if (ctx.length > 0) {
                const parent = ctx[ctx.length - 1];
                if (parent.type === 'obj') parent.key = null; // Value finished
                else if (parent.type === 'arr') parent.index++; // Array item finished
            }
        } else if (char === '[') {
            // Array Start
            ctx.push({ type: 'arr', index: 0, key: null, expectingKey: false });
        } else if (char === ']') {
            ctx.pop();
            // Array End
            if (ctx.length > 0) {
                const parent = ctx[ctx.length - 1];
                if (parent.type === 'obj') parent.key = null;
                else if (parent.type === 'arr') parent.index++;
            }
        } else if (char === ',') {
            if (ctx.length > 0) {
                const frame = ctx[ctx.length - 1];
                if (frame.type === 'obj') frame.expectingKey = true;
            }
        } else if (isValidPrimitiveChar(char)) {
            // Primitive (number, boolean, null)
            const prev = i > 0 ? jsonString[i - 1] : ' ';
            if (!isValidPrimitiveChar(prev)) {
                // Start of primitive
                if (ctx.length > 0) {
                    const frame = ctx[ctx.length - 1];
                    if (frame.type === 'arr') {
                        let currentPath = "";
                        for (const f of ctx) {
                            if (f.type === 'arr') currentPath += `[${f.index}]`;
                            else if (f.key) currentPath += `.${f.key}`;
                        }
                        if (currentPath.startsWith('.')) currentPath = currentPath.substring(1);

                        map.set(currentPath, line);

                        // FIX Attempt: just flag it
                        frame.primitiveStarted = true;
                    }
                }
            }
        }

        // Handle delayed increment for primitives
        if (ctx.length > 0) {
            const frame = ctx[ctx.length - 1];
            if (frame.type === 'arr' && frame.primitiveStarted) {
                if (char === ',' || char === ']') {
                    frame.index++;
                    frame.primitiveStarted = false;
                }
            }
        }
    }

    return map;
}

function isValidPrimitiveChar(c) {
    return (c >= '0' && c <= '9') || c === '-' || c === '.' || c === 't' || c === 'r' || c === 'u' || c === 'e' || c === 'f' || c === 'a' || c === 'l' || c === 's' || c === 'n';
}

// --- Test Execution ---

const filePath = path.join(__dirname, 'in', '10kelements.json');
console.log(`Reading ${filePath}...`);

try {
    const raw = fs.readFileSync(filePath, 'utf8');
    console.log(`File read. logic start...`);

    const start = Date.now();
    const map = buildLineMap(raw);
    const end = Date.now();

    console.log(`Map built in ${end - start}ms. Size: ${map.size}`);

} catch (e) {
    console.error("Error:", e);
}
