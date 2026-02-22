import React, { memo } from 'react';

// Define the shape of a flattened item for the virtual list
export interface VirtualItem {
    id: string; // unique ID for key
    path: string;
    keyName: string;
    value: any;
    depth: number;
    isExpanded: boolean;
    isExpandable: boolean;
    isLast: boolean;
    parent: any;
    indexInParent: number;
    lineNumber: number;
    originalLine?: number;
    type: 'object' | 'array' | 'primitive';
    closing?: boolean; // traverse end
}

interface VirtualJsonNodeProps {
    item: VirtualItem;
    style: React.CSSProperties;
    onToggle: (path: string) => void;
    onSelect: (path: string) => void;
    isSelected: boolean;
    searchTerm?: string;
}

const VirtualJsonNode: React.FC<VirtualJsonNodeProps> = memo(({ item, style, onToggle, onSelect, isSelected, searchTerm }) => {
    const { path, keyName, value, depth, isExpanded, isExpandable, isLast, lineNumber, originalLine, type, closing } = item;

    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        onToggle(path);
    };

    const handleSelect = () => {
        onSelect(path);
    };

    const gutterWidth = 60;
    const contentPadding = 70 + (depth * 20); // Gutter + Margin + Indent

    // Render closing brace/bracket
    if (closing) {
        return (
            <div
                style={style}
                className="flex items-center font-mono text-[13px] leading-5 text-gray-400 select-none hover:bg-white/5 transition-colors"
                onClick={handleSelect}
            >
                <div
                    className="absolute left-0 top-0 bottom-0 text-right text-gray-600 bg-slate-900/50 border-r border-slate-700 pr-2 select-none flex items-center justify-end font-mono text-xs"
                    style={{ width: gutterWidth }}
                >
                    {lineNumber}
                </div>
                <div style={{ paddingLeft: contentPadding }} className="flex-1">
                    <span className="text-white">
                        {type === 'object' ? '}' : ']'}{!isLast ? ',' : ''}
                    </span>
                </div>
            </div>
        );
    }

    // Search highlighting
    const searchMatch = (() => {
        if (!searchTerm || !searchTerm.trim()) return false;
        const term = searchTerm.toLowerCase();
        const keyStr = keyName !== undefined ? String(keyName).toLowerCase() : '';
        const valStr = value !== undefined && value !== null && !isExpandable ? String(value).toLowerCase() : '';
        return keyStr.includes(term) || valStr.includes(term);
    })();

    // Dynamic classes based on state
    const bgClass = searchMatch ? 'bg-yellow-500/20' : isSelected ? 'bg-cyan-500/10' : 'hover:bg-white/5';
    const borderClass = searchMatch ? 'border-l-[3px] border-yellow-400' : isSelected ? 'border-l-2 border-cyan-400' : 'border-l-2 border-transparent';

    return (
        <div
            onClick={handleSelect}
            style={style}
            className={`flex items-center font-mono text-[13px] leading-5 cursor-pointer transition-colors ${bgClass} ${borderClass}`}
        >
            {/* Line Number */}
            <div
                className="absolute left-0 top-0 bottom-0 text-right text-gray-500 bg-slate-900 border-r border-slate-700 pr-2 select-none flex items-center justify-end font-mono text-xs z-10"
                style={{ width: gutterWidth }}
            >
                {lineNumber}
                {originalLine && originalLine !== lineNumber && (
                    <span className="text-gray-600 ml-1 text-[10px]">
                        ({originalLine})
                    </span>
                )}
            </div>

            <div style={{ paddingLeft: contentPadding }} className="flex items-center w-full">
                {/* Expand/Collapse Toggle */}
                <div
                    onClick={isExpandable ? handleToggle : undefined}
                    className={`w-4 mr-1 flex justify-center select-none text-[10px] text-gray-400 ${isExpandable ? 'cursor-pointer hover:text-cyan-400' : 'invisible'}`}
                >
                    {isExpandable && (isExpanded ? '▼' : '▶')}
                </div>

                {/* Key */}
                {keyName !== undefined && (
                    <span className="text-sky-300 mr-1.5 break-keep">
                        {JSON.stringify(keyName)}:
                    </span>
                )}

                {/* Value Preview */}
                <span className="text-[#ce9178] truncate">
                    {isExpandable ? (
                        <>
                            <span className="text-white">{type === 'object' ? '{' : '['}</span>
                            {!isExpanded && (
                                <span className="text-gray-500 italic mx-1">...</span>
                            )}
                            {!isExpanded && (
                                <span className="text-white">{type === 'object' ? '}' : ']'}{!isLast ? ',' : ''}</span>
                            )}
                        </>
                    ) : (
                        <>
                            <span className={
                                typeof value === 'string' ? 'text-[#ce9178]' :
                                    typeof value === 'number' ? 'text-[#b5cea8]' :
                                        'text-[#569cd6]'
                            }>
                                {JSON.stringify(value)}
                            </span>
                            <span className="text-white">{!isLast ? ',' : ''}</span>
                        </>
                    )}
                </span>
            </div>
        </div>
    );
});

VirtualJsonNode.displayName = 'VirtualJsonNode';

export default VirtualJsonNode;
