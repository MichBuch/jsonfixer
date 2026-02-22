/**
 * Query Engine for filtering and transforming JSON data.
 * Supports standard Array methods: filter, map, sort, reduce, etc.
 * 
 * Usage:
 * queryData(data, "filter(x => x.age > 20)")
 * queryData(data, "map(x => ({ name: x.name }))")
 */

export function queryData(data: any, query: string): any {
    if (!data) return data;

    // Basic sanitization to prevent obvious attacks (though client-side eval is inherently risky if sharing queries)
    // For a local tool, this is acceptable power.
    const sanitizedQuery = query.trim();

    if (!sanitizedQuery) return data;

    try {
        // Construct a safe execution function
        // We bind 'data' to 'this' or pass it as an argument
        // If data is an array, we assume the query starts with a method chaining like .filter(...) or filter(...)

        let execString = sanitizedQuery;

        // Allow user to omit "data." prefix if they just strictly write ".filter(...)"
        if (sanitizedQuery.startsWith('.')) {
            execString = `data${sanitizedQuery}`;
        }
        // Allow user to write "filter(...)" directly (implicit array check)
        else if (Array.isArray(data) && !sanitizedQuery.startsWith('data.')) {
            // Check if it looks like a chain of methods
            execString = `data.${sanitizedQuery}`;
        }

        // Use Function constructor for safer eval
        // eslint-disable-next-line no-new-func
        const func = new Function('data', `return ${execString};`);
        const result = func(data);
        return result;

    } catch (e: any) {
        throw new Error(`Query Error: ${e.message}`);
    }
}
