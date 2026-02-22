import React, { memo, useMemo, useRef, useImperativeHandle, forwardRef } from 'react';
import { List } from 'react-window';

export interface VirtualSourceViewerProps {
    jsonString: string;
    searchTerm: string;
    diffLines?: Set<number>;
    editable?: boolean;
    onEdit?: (newValue: string) => void;
}

export interface VirtualSourceViewerRef {
    scrollTo: (scrollTop: number) => void;
    getScrollTop: () => number;
}

const GUTTER = 52;
const ROW_H = 20;
const BG = '#1a1a2e';
const GUTTER_BG = '#16213e';
const GUTTER_BORD = '#0f3460';
const GUTTER_NUM = '#4a5568';
const DIFF_NUM = '#e3b341';
const DIFF_ROW = 'rgba(227,179,65,0.10)';
const DIFF_BAR = '#e3b341';
const SRCH_ROW = 'rgba(0,255,255,0.08)';
const SRCH_BAR = '#00ffff';
const SYN = {
    key: '#7dd3fc', str: '#86efac', num: '#fcd34d',
    bool: '#c084fc', null: '#a0a0a0', punct: '#8892a4',
};
const FONT = "'Consolas','Monaco','Courier New',monospace";

function syntaxLine(line: string): React.ReactNode {
    const m = line.match(/^(\s*)("(?:[^"\\]|\\.)*")(\s*:\s*)?(.*?)(\s*,?\s*)$/);
    if (!m) return <span style={{ color: SYN.punct }}>{line}</span>;
    const [, indent, token, sep, rest, trail] = m;
    const isKey = !!sep;
    let valColor = SYN.punct;
    if (rest) {
        const v = rest.trim();
        if (v === 'true' || v === 'false') valColor = SYN.bool;
        else if (v === 'null') valColor = SYN.null;
        else if (/^-?\d/.test(v)) valColor = SYN.num;
        else if (v.startsWith('"')) valColor = SYN.str;
    }
    return (
        <>
            <span style={{ color: SYN.punct }}>{indent}</span>
            <span style={{ color: isKey ? SYN.key : SYN.str }}>{token}</span>
            {sep && <span style={{ color: SYN.punct }}>{sep}</span>}
            {rest && <span style={{ color: valColor }}>{rest}</span>}
            {trail && <span style={{ color: SYN.punct }}>{trail}</span>}
        </>
    );
}

// Row component — receives index, style, plus custom props via rowProps
interface RowExtraProps {
    lines: string[];
    searchTerm: string;
    diffLines?: Set<number>;
}

const VSRow = memo(({ index, style, lines, searchTerm, diffLines }: {
    index: number; style: React.CSSProperties;
} & RowExtraProps) => {
    const line = lines[index] ?? '';
    const lineNum = index + 1;
    const isDiff = diffLines?.has(lineNum) ?? false;
    const isMatch = !!searchTerm?.trim() && line.toLowerCase().includes(searchTerm.toLowerCase());
    const rowBg = isMatch ? SRCH_ROW : isDiff ? DIFF_ROW : BG;
    const leftBar = isMatch ? `2px solid ${SRCH_BAR}` : isDiff ? `2px solid ${DIFF_BAR}` : '2px solid transparent';

    return (
        <div style={{ ...style, display: 'flex', alignItems: 'center', background: rowBg, borderLeft: leftBar }}>
            <div style={{
                width: GUTTER, minWidth: GUTTER, flexShrink: 0, textAlign: 'right',
                paddingRight: 10, color: isDiff ? DIFF_NUM : GUTTER_NUM,
                fontWeight: isDiff ? 700 : 400, fontSize: 11, fontFamily: FONT,
                lineHeight: `${ROW_H}px`, userSelect: 'none', background: GUTTER_BG,
                borderRight: `1px solid ${GUTTER_BORD}`,
            }}>
                {lineNum}
            </div>
            <div style={{
                paddingLeft: 10, whiteSpace: 'pre', fontFamily: FONT,
                fontSize: 13, lineHeight: `${ROW_H}px`, overflow: 'hidden', flex: 1,
            }}>
                {syntaxLine(line)}
            </div>
        </div>
    );
});
VSRow.displayName = 'VSRow';

// Main viewer component
const VirtualSourceViewer = forwardRef<VirtualSourceViewerRef, VirtualSourceViewerProps>(({
    jsonString, searchTerm, diffLines,
}, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<any>(null);
    const [dims, setDims] = React.useState({ w: 0, h: 0 });

    const lines = useMemo(
        () => (jsonString ? jsonString.split(/\r\n|\n|\r/) : []),
        [jsonString],
    );

    React.useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const measure = () => setDims({ w: el.clientWidth, h: el.clientHeight });
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    useImperativeHandle(ref, () => ({
        scrollTo: (scrollTop: number) => { listRef.current?.scrollTo(scrollTop); },
        getScrollTop: () => listRef.current?.state?.scrollOffset ?? 0,
    }));

    const L = List as any; // react-window v2 typing workaround

    return (
        <div ref={containerRef} style={{ height: '100%', width: '100%', overflow: 'hidden', background: BG }}>
            {dims.h > 0 && (
                <L
                    listRef={listRef}
                    height={dims.h}
                    width={dims.w}
                    rowCount={lines.length}
                    rowHeight={ROW_H}
                    rowComponent={VSRow}
                    rowProps={{ lines, searchTerm, diffLines }}
                    overscanCount={5}
                />
            )}
        </div>
    );
});

VirtualSourceViewer.displayName = 'VirtualSourceViewer';
export default VirtualSourceViewer;
