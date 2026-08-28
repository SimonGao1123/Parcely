import type { BlockPosition, PageBlockLayout } from "@/types/block";
import type { BlockSpan } from "./stagedBlock";

// Mirrors GRID_COLUMNS in store/constants.py and the grid-cols-12 in pageGrid.
export const GRID_COLUMNS = 12;

// Empty rows kept below the lowest block so there is always somewhere to drop a
// new one. Without this an empty page has a zero-height grid and no drop target
// at all, and a full one offers no way to append past the end.
export const TRAILING_ROWS = 6;

const BREAKPOINTS = ["desktop", "tablet", "mobile"] as const;

// Port of rect_overlap in store/validators.py. Kept identical so the client
// rejects exactly what the server would, rather than merely something similar.
function rectOverlap(a: BlockPosition, b: BlockPosition): boolean {
    if (a.col_start >= b.col_start + b.col_span || b.col_start >= a.col_start + a.col_span) return false;
    if (a.row_start >= b.row_start + b.row_span || b.row_start >= a.row_start + a.row_span) return false;
    return true;
}

// Matches both validate_page_layout's `layout.get(bp) or layout["desktop"]` and
// the var() fallbacks in the .page-block media queries.
function positionAt(layout: PageBlockLayout, breakpoint: (typeof BREAKPOINTS)[number]): BlockPosition {
    return layout[breakpoint] ?? layout.desktop;
}

export function isWithinBounds(position: BlockPosition): boolean {
    return (
        position.col_start >= 0 &&
        position.col_span >= 1 &&
        position.col_start + position.col_span <= GRID_COLUMNS &&
        position.row_start >= 0 &&
        position.row_span >= 1
    );
}

// Only the moved block is checked against the rest: the others haven't changed
// and were already valid, so re-checking every pair would be wasted work on
// every pointermove.
//
// All three breakpoints are checked even though the editor only edits desktop,
// because a block carrying an explicit tablet or mobile layout can collide there
// while desktop stays clear — and the server checks all three.
export function wouldOverlap(candidate: PageBlockLayout, others: PageBlockLayout[]): boolean {
    return BREAKPOINTS.some((breakpoint) => {
        const position = positionAt(candidate, breakpoint);
        return others.some((other) => rectOverlap(position, positionAt(other, breakpoint)));
    });
}

// Absolute placement, for dropping a block that has no position yet.
//
// Deliberately not shared with PageEditor's handlePointerMove, which measures a
// delta from the position captured at pointerdown so that rounding can't compound
// across frames. There is no such baseline here — the cursor's own coordinates
// are the whole input — so the two look similar but cannot be merged.
export function cellAt(rect: DOMRect, clientX: number, clientY: number): { col: number; row: number } {
    // cells are square, so one cell size covers both axes
    const cell = rect.width / GRID_COLUMNS;
    return {
        col: Math.floor((clientX - rect.left) / cell),
        row: Math.floor((clientY - rect.top) / cell),
    };
}

// Pins the drop inside the grid instead of rejecting it, so dragging past an
// edge slides the block along that edge rather than making it vanish. Rows have
// no upper bound; only row_start >= 0 is enforced, matching isWithinBounds.
export function clampToGrid(col: number, row: number, span: BlockSpan): BlockPosition {
    return {
        col_start: Math.min(Math.max(col, 0), GRID_COLUMNS - span.col_span),
        row_start: Math.max(row, 0),
        col_span: span.col_span,
        row_span: span.row_span,
    };
}

// One past the lowest occupied row, plus room to drop into.
export function gridRowCount(layouts: PageBlockLayout[]): number {
    const bottom = layouts.reduce(
        (lowest, layout) => Math.max(lowest, layout.desktop.row_start + layout.desktop.row_span),
        0,
    );
    return bottom + TRAILING_ROWS;
}
