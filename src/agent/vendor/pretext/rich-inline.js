/*! Pretext 0.0.9 | MIT | Copyright (c) 2026 Pretext contributors */
import { prepareWithSegments } from './layout.js';
import { buildLineTextFromRange, getLineTextCache } from './line-text.js';
import { stepPreparedLineGeometry } from './line-break.js';
import { getFontMeasurementState, getSegmentMetrics } from './measurement.js';
const EMPTY_LAYOUT_CURSOR = {
    segmentIndex: 0,
    graphemeIndex: 0
};
const RICH_INLINE_START_CURSOR = {
    itemIndex: 0,
    segmentIndex: 0,
    graphemeIndex: 0
};
function getInternalPreparedRichInline(prepared) {
    return prepared;
}
function cloneCursor(cursor) {
    return {
        segmentIndex: cursor.segmentIndex,
        graphemeIndex: cursor.graphemeIndex
    };
}
function isLineStartCursor(cursor) {
    return cursor.segmentIndex === 0 && cursor.graphemeIndex === 0;
}
function isCollapsibleBoundaryWhitespace(code) {
    return code === 0x20 || code === 0x09 || code === 0x0A || code === 0x0C || code === 0x0D;
}
function getCollapsedSpaceWidth(font, letterSpacing) {
    const { cache } = getFontMeasurementState(font, false);
    return getSegmentMetrics(' ', cache).width + letterSpacing;
}
function measureWholeItem(prepared) {
    const end = {
        segmentIndex: 0,
        graphemeIndex: 0
    };
    return stepPreparedLineGeometry(prepared, end, Number.POSITIVE_INFINITY);
}
function endsInsideFirstSegment(segmentIndex, graphemeIndex) {
    return segmentIndex === 0 && graphemeIndex > 0;
}
export function prepareRichInline(items) {
    const preparedItems = Array.from({
        length: items.length
    });
    let pendingGapWidth = null;
    let breakAfterPreviousItem = false;
    for(let index = 0; index < items.length; index++){
        const item = items[index];
        const letterSpacing = item.letterSpacing ?? 0;
        let start = 0;
        while(start < item.text.length && isCollapsibleBoundaryWhitespace(item.text.charCodeAt(start)))start++;
        if (start === item.text.length) {
            if (start > 0 && pendingGapWidth === null) {
                pendingGapWidth = getCollapsedSpaceWidth(item.font, letterSpacing);
            }
            continue;
        }
        let end = item.text.length;
        while(end > start && isCollapsibleBoundaryWhitespace(item.text.charCodeAt(end - 1)))end--;
        const hasLeadingWhitespace = start > 0;
        const hasTrailingWhitespace = end < item.text.length;
        const trimmedText = item.text.slice(start, end);
        const gapBefore = pendingGapWidth ?? (hasLeadingWhitespace ? getCollapsedSpaceWidth(item.font, letterSpacing) : 0);
        const prepared = prepareWithSegments(trimmedText, item.font, letterSpacing === 0 ? undefined : {
            letterSpacing
        });
        const wholeWidth = measureWholeItem(prepared);
        const establishesLine = wholeWidth !== null || prepared.kinds.includes('zero-width-break');
        const preparedItem = {
            break: item.break ?? 'normal',
            breakBefore: pendingGapWidth !== null || hasLeadingWhitespace || breakAfterPreviousItem,
            establishesLine,
            extraWidth: item.extraWidth ?? 0,
            gapBefore,
            naturalWidth: wholeWidth ?? 0,
            prepared
        };
        preparedItems[index] = preparedItem;
        if (establishesLine) breakAfterPreviousItem = prepared.kinds.at(-1) === 'zero-width-break';
        pendingGapWidth = hasTrailingWhitespace ? getCollapsedSpaceWidth(item.font, letterSpacing) : null;
    }
    return {
        items: preparedItems
    };
}
function stepRichInlineLine(flow, maxWidth, cursor, collectFragment) {
    if (flow.items.length === 0 || cursor.itemIndex >= flow.items.length) return null;
    const safeWidth = Math.max(1, maxWidth);
    let hasContent = false;
    let lineWidth = 0;
    let remainingWidth = safeWidth;
    let itemIndex = cursor.itemIndex;
    lineLoop: while(itemIndex < flow.items.length){
        const item = flow.items[itemIndex];
        if (item === undefined) {
            itemIndex++;
            cursor.segmentIndex = 0;
            cursor.graphemeIndex = 0;
            continue;
        }
        if (!isLineStartCursor(cursor) && cursor.segmentIndex === item.prepared.segments.length && cursor.graphemeIndex === 0) {
            itemIndex++;
            cursor.segmentIndex = 0;
            cursor.graphemeIndex = 0;
            continue;
        }
        if (!item.establishesLine) {
            collectFragment?.(itemIndex, 0, 0, cloneCursor(EMPTY_LAYOUT_CURSOR), {
                segmentIndex: item.prepared.segments.length,
                graphemeIndex: 0
            });
            itemIndex++;
            cursor.segmentIndex = 0;
            cursor.graphemeIndex = 0;
            continue;
        }
        const gapBefore = hasContent ? item.gapBefore : 0;
        const atItemStart = isLineStartCursor(cursor);
        if (item.break === 'never') {
            if (!atItemStart) {
                itemIndex++;
                cursor.segmentIndex = 0;
                cursor.graphemeIndex = 0;
                continue;
            }
            const occupiedWidth = item.naturalWidth + item.extraWidth;
            const totalWidth = gapBefore + occupiedWidth;
            if (hasContent && totalWidth > remainingWidth) break lineLoop;
            collectFragment?.(itemIndex, gapBefore, occupiedWidth, cloneCursor(EMPTY_LAYOUT_CURSOR), {
                segmentIndex: item.prepared.segments.length,
                graphemeIndex: 0
            });
            hasContent = true;
            lineWidth += totalWidth;
            remainingWidth = safeWidth - lineWidth;
            itemIndex++;
            cursor.segmentIndex = 0;
            cursor.graphemeIndex = 0;
            continue;
        }
        const reservedWidth = gapBefore + item.extraWidth;
        if (hasContent && reservedWidth > remainingWidth) break lineLoop;
        if (atItemStart) {
            const totalWidth = reservedWidth + item.naturalWidth;
            if (totalWidth <= remainingWidth) {
                collectFragment?.(itemIndex, gapBefore, item.naturalWidth + item.extraWidth, cloneCursor(EMPTY_LAYOUT_CURSOR), {
                    segmentIndex: item.prepared.segments.length,
                    graphemeIndex: 0
                });
                hasContent = true;
                lineWidth += totalWidth;
                remainingWidth = safeWidth - lineWidth;
                itemIndex++;
                cursor.segmentIndex = 0;
                cursor.graphemeIndex = 0;
                continue;
            }
        }
        const availableWidth = Math.max(1, remainingWidth - reservedWidth);
        const lineEnd = {
            segmentIndex: cursor.segmentIndex,
            graphemeIndex: cursor.graphemeIndex
        };
        const lineWidthForItem = stepPreparedLineGeometry(item.prepared, lineEnd, availableWidth);
        if (lineWidthForItem === null) {
            itemIndex++;
            cursor.segmentIndex = 0;
            cursor.graphemeIndex = 0;
            continue;
        }
        if (cursor.segmentIndex === lineEnd.segmentIndex && cursor.graphemeIndex === lineEnd.graphemeIndex) {
            itemIndex++;
            cursor.segmentIndex = 0;
            cursor.graphemeIndex = 0;
            continue;
        }
        const itemOccupiedWidth = lineWidthForItem + item.extraWidth;
        const lineWidthContribution = gapBefore + itemOccupiedWidth;
        if (hasContent && atItemStart && lineWidthContribution > remainingWidth) break lineLoop;
        if (hasContent && atItemStart && item.breakBefore && endsInsideFirstSegment(lineEnd.segmentIndex, lineEnd.graphemeIndex)) {
            break lineLoop;
        }
        collectFragment?.(itemIndex, gapBefore, itemOccupiedWidth, cloneCursor(cursor), {
            segmentIndex: lineEnd.segmentIndex,
            graphemeIndex: lineEnd.graphemeIndex
        });
        hasContent = true;
        lineWidth += lineWidthContribution;
        remainingWidth = safeWidth - lineWidth;
        if (lineEnd.segmentIndex === item.prepared.segments.length && lineEnd.graphemeIndex === 0) {
            itemIndex++;
            cursor.segmentIndex = 0;
            cursor.graphemeIndex = 0;
            continue;
        }
        cursor.segmentIndex = lineEnd.segmentIndex;
        cursor.graphemeIndex = lineEnd.graphemeIndex;
        break;
    }
    if (!hasContent) return null;
    cursor.itemIndex = itemIndex;
    return lineWidth;
}
export function layoutNextRichInlineLineRange(prepared, maxWidth, start = RICH_INLINE_START_CURSOR) {
    const flow = getInternalPreparedRichInline(prepared);
    const end = {
        itemIndex: start.itemIndex,
        segmentIndex: start.segmentIndex,
        graphemeIndex: start.graphemeIndex
    };
    const fragments = [];
    const width = stepRichInlineLine(flow, maxWidth, end, (itemIndex, gapBefore, occupiedWidth, fragmentStart, fragmentEnd)=>{
        fragments.push({
            itemIndex,
            gapBefore,
            occupiedWidth,
            start: fragmentStart,
            end: fragmentEnd
        });
    });
    if (width === null) return null;
    return {
        fragments,
        width,
        end
    };
}
function materializeFragmentText(item, fragment) {
    return buildLineTextFromRange(item.prepared, getLineTextCache(item.prepared), fragment.start.segmentIndex, fragment.start.graphemeIndex, fragment.end.segmentIndex, fragment.end.graphemeIndex);
}
export function materializeRichInlineLineRange(prepared, line) {
    const flow = getInternalPreparedRichInline(prepared);
    const fragments = [];
    for(let i = 0; i < line.fragments.length; i++){
        const fragment = line.fragments[i];
        const item = flow.items[fragment.itemIndex];
        if (item === undefined) throw new Error('Missing rich-text inline item for fragment');
        fragments.push({
            itemIndex: fragment.itemIndex,
            text: materializeFragmentText(item, fragment),
            gapBefore: fragment.gapBefore,
            occupiedWidth: fragment.occupiedWidth,
            start: fragment.start,
            end: fragment.end
        });
    }
    return {
        fragments,
        width: line.width,
        end: line.end
    };
}
export function walkRichInlineLineRanges(prepared, maxWidth, onLine) {
    let lineCount = 0;
    const cursor = {
        ...RICH_INLINE_START_CURSOR
    };
    while(true){
        const line = layoutNextRichInlineLineRange(prepared, maxWidth, cursor);
        if (line === null) return lineCount;
        cursor.itemIndex = line.end.itemIndex;
        cursor.segmentIndex = line.end.segmentIndex;
        cursor.graphemeIndex = line.end.graphemeIndex;
        onLine(line);
        lineCount++;
    }
}
export function measureRichInlineStats(prepared, maxWidth) {
    const flow = getInternalPreparedRichInline(prepared);
    let lineCount = 0;
    let maxLineWidth = 0;
    const cursor = {
        itemIndex: 0,
        segmentIndex: 0,
        graphemeIndex: 0
    };
    while(true){
        const lineWidth = stepRichInlineLine(flow, maxWidth, cursor);
        if (lineWidth === null) {
            return {
                lineCount,
                maxLineWidth
            };
        }
        lineCount++;
        if (lineWidth > maxLineWidth) maxLineWidth = lineWidth;
    }
}
