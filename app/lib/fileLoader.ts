export type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];

export interface LoadResult {
  data?: JsonValue;
  filename?: string;
  sizeBytes?: number;
  error?: string;
}

export function parseJsonFile(text: string, filename = ""): LoadResult {
  if (!text || text.trim() === "") {
    return { error: "Empty input" };
  }
  try {
    const data = JSON.parse(text);
    return {
      data,
      filename,
      sizeBytes: new TextEncoder().encode(text).length,
    };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
