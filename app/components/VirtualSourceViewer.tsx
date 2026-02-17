import React, { memo, useMemo } from 'react';
import { List } from 'react-window';
import { AutoSizer } from 'react-virtualized-auto-sizer';

interface VirtualSourceViewerProps {
    jsonString: string;
    searchTerm: string;
}

const Row = memo(({ index, style, lines, searchTerm }: any) => {
    const line = lines[index];

    // Simple syntax highlighting regex
    // Attempt to match: indentation, key/string, separator, value, comma
    const parts = line.match(/^(\s*)(".*?")(\s*:\s*)?(.*?)(\s*,?)?$/);

    let content: React.ReactNode = line;

    if (parts) {
        const [, indent, keyOrString, separator, value, comma] = parts;
        const isKey = !!separator;

        content = (
            <>
                {indent}
                <span className={isKey ? "key" : "string"} style={{ color: isKey ? '#9cdcfe' : '#ce9178' }}>
                    {keyOrString}
                </span>
                {separator && <span style={{ color: '#d4d4d4' }}>{separator}</span>}
                {value && (
                    <span style={{
                        color: /true|false/.test(value) ? '#569cd6' :
                            /null/.test(value) ? '#569cd6' :
                                /^-?\d/.test(value) ? '#b5cea8' :
                                    /"/.test(value) ? '#ce9178' : '#d4d4d4'
                    }}>
                        {value}
                    </span>
                )}
                {comma && <span style={{ color: '#d4d4d4' }}>{comma}</span>}
            </>
        );
    } else {
        // Fallback for simple brackets/braces
        if (line.trim() === '{' || line.trim() === '}' || line.trim() === '[' || line.trim() === ']') {
            content = <span style={{ color: '#d4d4d4' }}>{line}</span>;
        }
    }

    // Search Highlighting
    if (searchTerm && searchTerm.trim().length > 0) {
        const lowerLine = line.toLowerCase();
        const lowerSearch = searchTerm.toLowerCase();
        if (lowerLine.includes(lowerSearch)) {
            // Highlight background
            return (
                <div style={{ ...style, backgroundColor: '#444400', whiteSpace: 'pre' }}>
                    {content}
                </div>
            );
        }
    }

    return <div style={{ ...style, whiteSpace: 'pre' }}>{content}</div>;
});

Row.displayName = 'VirtualSourceRow';

const VirtualSourceViewer: React.FC<VirtualSourceViewerProps> = ({ jsonString, searchTerm }) => {
    const lines = useMemo(() => {
        if (!jsonString) return [];
        return jsonString.split(/\r\n|\n|\r/);
    }, [jsonString]);

    return (
        <div style={{ flex: 1, height: '100%', width: '100%', overflow: 'hidden' }}>
            <AutoSizer
                renderProp={({ height, width }: { height: number | undefined; width: number | undefined }) => {
                    const ListComponent = List as any;
                    return (
                        <ListComponent
                            height={height ?? 0}
                            width={width ?? 0}
                            rowCount={lines.length}
                            rowHeight={24}
                            rowComponent={Row}
                            rowProps={{ lines, searchTerm }}
                        />
                    );
                }}
            />
        </div>
    );
};

export default VirtualSourceViewer;
