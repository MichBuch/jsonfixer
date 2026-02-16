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
    const { path, keyName, value, depth, isExpanded, isExpandable, isLast, lineNumber, type, closing } = item;

    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        onToggle(path);
    };

    const handleSelect = () => {
        onSelect(path);
    };

    // Render closing brace/bracket
    if (closing) {
        return (
            <div
                style={{
                    ...style,
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: 45 + (depth * 20),
                    fontFamily: 'monospace',
                    fontSize: '13px',
                    lineHeight: '20px',
                    cursor: 'default',
                }}
            >
                <div style={{
                    position: 'absolute',
                    left: 0,
                    width: 35,
                    textAlign: 'right',
                    color: '#555',
                    borderRight: '1px solid #333',
                    paddingRight: 5,
                    userSelect: 'none'
                }}>
                    {lineNumber}
                </div>
                <span className="key-value" style={{ color: '#fff' }}>
                    {type === 'object' ? '}' : ']'}{!isLast ? ',' : ''}
                </span>
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

    const rowStyle: React.CSSProperties = {
        ...style,
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 45 + (depth * 20), // Keep original padding logic
        fontFamily: 'monospace', // Keep original font family
        fontSize: '13px', // Keep original font size
        lineHeight: '20px',
        cursor: 'pointer',
        background: searchMatch ? 'rgba(255, 255, 0, 0.15)' : isSelected ? 'rgba(0, 255, 255, 0.15)' : 'transparent',
        borderLeft: searchMatch ? '3px solid #ffff00' : (isSelected ? '2px solid cyan' : '2px solid transparent'),
    };

    return (
        <div
            onClick={handleSelect}
            style={rowStyle}
            className="virtual-row"
        >
            {/* Line Number */}
            <div style={{
                position: 'absolute',
                left: 0,
                width: 35,
                textAlign: 'right',
                color: '#555',
                borderRight: '1px solid #333',
                paddingRight: 5,
                userSelect: 'none',
                height: '100%',
                background: '#1e293b' // Match background
            }}>
                {lineNumber}
            </div>

            {/* Expand/Collapse Toggle */}
            <div
                onClick={isExpandable ? handleToggle : undefined}
                style={{
                    width: 12,
                    marginRight: 4,
                    cursor: isExpandable ? 'pointer' : 'default',
                    display: 'flex',
                    justifyContent: 'center',
                    userSelect: 'none',
                    fontSize: '10px'
                }}
            >
                {isExpandable && (isExpanded ? '▼' : '▶')}
            </div>

            {/* Key */}
            {keyName !== undefined && (
                <span className="key-name" style={{ color: '#9cdcfe', marginRight: 5 }}>
                    {JSON.stringify(keyName)}:
                </span>
            )}

            {/* Value Preview */}
            <span className="key-value" style={{ color: '#ce9178', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {isExpandable ? (
                    <>
                        <span style={{ color: '#fff' }}>{type === 'object' ? '{' : '['}</span>
                        {!isExpanded && (
                            <span style={{ color: '#888', fontStyle: 'italic', margin: '0 4px' }}>...</span>
                        )}
                        {!isExpanded && (
                            <span style={{ color: '#fff' }}>{type === 'object' ? '}' : ']'}{!isLast ? ',' : ''}</span>
                        )}
                    </>
                ) : (
                    <>
                        <span style={{
                            color: typeof value === 'string' ? '#ce9178' :
                                typeof value === 'number' ? '#b5cea8' :
                                    '#569cd6'
                        }}>
                            {JSON.stringify(value)}
                        </span>
                        <span style={{ color: '#fff' }}>{!isLast ? ',' : ''}</span>
                    </>
                )}
            </span>
        </div>
    );
});

VirtualJsonNode.displayName = 'VirtualJsonNode';

export default VirtualJsonNode;
