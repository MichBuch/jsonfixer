"use client";

import { useState, useMemo } from "react";
import { List } from "react-window";
import { AutoSizer } from "react-virtualized-auto-sizer";
import VirtualJsonNode, { VirtualItem } from "./VirtualJsonNode";

type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];

interface JsonEditorProps {
  data: Record<string, unknown> | null;
  onChange: (d: Record<string, unknown>) => void;
  sortMode?: "by-key" | "by-value";
  sortByPath?: string;
  protectedPaths?: string[];
  collapsedPaths: Set<string>;
  toggleCollapse: (path: string) => void;
  searchTerm?: string;
  lineMap?: Map<string, number>;
}

export default function JsonEditor({
  data,
  onChange,
  collapsedPaths,
  toggleCollapse,
  searchTerm,
  lineMap,
}: JsonEditorProps) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  // Flatten data based on expanded state
  const flattenedItems = useMemo(() => {
    if (!data) return [];

    const items: VirtualItem[] = [];
    let runningLineNumber = 1;

    const traverse = (
      current: JsonValue,
      path: string,
      keyName: string | undefined,
      parent: any,
      depth: number,
      isLast: boolean
    ) => {
      const isObj = current !== null && typeof current === 'object' && !Array.isArray(current);
      const isArr = Array.isArray(current);
      const isExpandable = isObj || isArr;
      const isExpanded = isExpandable && !collapsedPaths.has(path);
      const myLine = runningLineNumber++;
      const originalLine = lineMap?.get(path);

      items.push({
        id: path || 'root',
        path,
        keyName: keyName || '',
        value: current,
        depth,
        isExpanded,
        isExpandable,
        isLast,
        parent,
        indexInParent: -1, // Not strictly needed for display
        lineNumber: myLine,
        originalLine,
        type: isArr ? 'array' : isObj ? 'object' : 'primitive'
      });

      if (isExpanded) {
        const keys = isArr
          ? (current as JsonArray).map((_, i) => i.toString())
          : Object.keys(current as JsonObject);

        keys.forEach((k: string, i: number) => {
          const idx = isArr ? parseInt(k) : k;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const val = (current as any)[idx];
          const childPath = path ? `${path}.${k}` : k;
          const childIsLast = i === keys.length - 1;
          traverse(val, childPath, isArr ? undefined : k, current, depth + 1, childIsLast);
        });

        // Add closing tag
        items.push({
          id: `${path}-closing`,
          path,
          keyName: '', // Closing tag doesn't have a key
          value: null,
          depth,
          isExpanded: false,
          isExpandable: false,
          isLast,
          parent,
          indexInParent: -1,
          lineNumber: runningLineNumber++,
          type: isArr ? 'array' : 'object',
          closing: true
        });
      }
    };

    // Root visual wrapper
    items.push({
      id: 'root-start',
      path: 'root',
      keyName: '',
      value: data,
      depth: 0,
      isExpanded: true,
      isExpandable: true,
      isLast: true,
      parent: null,
      indexInParent: 0,
      lineNumber: runningLineNumber++,
      type: 'object',
      closing: false
    });

    // Traverse content of root
    Object.keys(data).forEach((k, i, arr) => {
      const isLast = i === arr.length - 1;
      traverse((data as any)[k], k, k, data, 1, isLast);
    });

    // Root closing
    items.push({
      id: 'root-end',
      path: 'root',
      keyName: '',
      value: null,
      depth: 0,
      isExpanded: false,
      isExpandable: false,
      isLast: true,
      parent: null,
      indexInParent: 0,
      lineNumber: runningLineNumber++,
      type: 'object',
      closing: true
    });

    return items;
  }, [data, collapsedPaths, lineMap]);

  if (!data) return null;

  return (
    <div style={{ width: '100%', height: '100%', minHeight: '400px' }}>
      <AutoSizer
        renderProp={({ height, width }: { height: number | undefined; width: number | undefined }) => {
          const w = width ?? 0;
          const h = height ?? 0;
          console.log('[JsonEditor] AutoSizer dims:', w, h, 'Items:', flattenedItems.length);
          const Row = ({ index, style, items, onToggle, onSelect, selectedPath }: any) => {
            const item = items[index];
            if (!item) return null;
            return (
              <VirtualJsonNode
                item={item}
                style={style}
                onToggle={onToggle}
                onSelect={onSelect}
                isSelected={selectedPath === item.path}
                searchTerm={searchTerm}
              />
            );
          };

          const ListComponent = List as any;

          return (
            <ListComponent
              height={h}
              rowCount={flattenedItems.length}
              rowHeight={24} // Fixed row height
              width={w}
              rowComponent={Row}
              rowProps={{
                items: flattenedItems,
                onToggle: toggleCollapse,
                onSelect: setSelectedPath,
                selectedPath,
                searchTerm,
                lineMap
              }}
            />
          );
        }}
      />
    </div>
  );
}
