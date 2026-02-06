/* eslint-disable no-restricted-globals */

// Helper function to evaluate path
function evaluatePath(obj, path) {
    if (!obj || !path) return obj;

    // Handle array indexing like "classification[0]"
    // Normalized path: "classification.0"
    const normalizedPath = path.replace(/\[(\d+)\]/g, '.$1');
    const parts = normalizedPath.split('.');

    let current = obj;
    for (const part of parts) {
        if (current === null || current === undefined) return undefined;
        current = current[part];
    }
    return current;
}

// Helper to get value for sorting
function getFieldValue(item, field) {
    if (!field) return item;
    return evaluatePath(item, field);
}

// Main worker listener
self.onmessage = function (e) {
    const { data, containerPath, sortField, sortDirection } = e.data;

    try {
        const updated = JSON.parse(JSON.stringify(data));
        const container = evaluatePath(updated, containerPath);

        if (!container) {
            throw new Error(`Container path "${containerPath}" not found`);
        }

        let itemCount = 0;

        // Sort the container
        if (Array.isArray(container)) {
            itemCount = container.length;
            container.sort((a, b) => {
                let valA = a;
                let valB = b;

                if (sortField) {
                    valA = getFieldValue(a, sortField);
                    valB = getFieldValue(b, sortField);
                }

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

            // Re-assign sorted object to parent
            const parts = containerPath.split(/\.|\[/).map(p => p.replace(/\]$/, ''));
            let parent = updated;
            for (let i = 0; i < parts.length - 1; i++) {
                parent = parent[parts[i]];
            }
            parent[parts[parts.length - 1]] = sorted;
        }

        // Return success
        self.postMessage({
            success: true,
            result: updated,
            itemCount
        });

    } catch (error) {
        self.postMessage({
            success: false,
            error: error.message
        });
    }
};
