'use client';

import { useRef, useState, type PointerEvent } from "react";
import Button from "@/components/button";
import { createPageBlock } from "@/lib/api/page/createPageBlock";
import { deletePageBlock } from "@/lib/api/page/deletePageBlock";
import { updatePageBlock } from "@/lib/api/page/updatePageBlock";
import type { BlockPosition, PageBlock } from "@/types/block";
import type { Page } from "@/types/page";
import type { Storefront } from "@/types/storefront";
import Block from "../pageblock/block";
import { blockLayoutVars } from "../pageblock/blockStyle";
import { styleVars } from "../storefront/styleVars";
import BlockModal, { type BlockSubmit } from "./blockModal";
import BlockSidebar from "./blockSidebar";
import EditorToolbar from "./editorToolbar";
import {
    cellAt,
    clampToGrid,
    GRID_COLUMNS,
    gridRowCount,
    isWithinBounds,
    wouldOverlap,
} from "./gridGeometry";
import { DEFAULT_SPANS, type StagedBlock } from "./stagedBlock";
import { useLayoutAutosave } from "./useLayoutAutosave";

type DragState = {
    blockId: number;
    mode: "move" | "resize";
    pointerX: number;
    pointerY: number;
    // the position at pointerdown; deltas are measured from here rather than
    // from the live position, which would compound rounding on every move
    origin: BlockPosition;
};

type ModalState = { mode: "create" } | { mode: "edit"; blockId: number };

function samePosition(a: BlockPosition, b: BlockPosition): boolean {
    return (
        a.col_start === b.col_start &&
        a.row_start === b.row_start &&
        a.col_span === b.col_span &&
        a.row_span === b.row_span
    );
}

export default function PageEditor({
    page,
    storefront,
    chrome,
}: {
    page: Page;
    storefront: Storefront;
    // The real navbar and header, rendered on the server by the route so they
    // stay out of the client bundle.
    chrome?: React.ReactNode;
}) {
    const [blocks, setBlocks] = useState<PageBlock[]>(page.blocks);
    const [staged, setStaged] = useState<StagedBlock[]>([]);
    const [ghost, setGhost] = useState<{ position: BlockPosition; valid: boolean } | null>(null);
    const [modal, setModal] = useState<ModalState | null>(null);
    const [dragging, setDragging] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const gridRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<DragState | null>(null);
    const stagedRef = useRef<StagedBlock | null>(null);
    // read in the pointerup handler, which has no access to the latest ghost
    // state — the setter is queued, not applied, by the time the drop lands
    const ghostRef = useRef<{ position: BlockPosition; valid: boolean } | null>(null);

    const { status, retry } = useLayoutAutosave(storefront.slug, page.slug, blocks);

    const rowCount = gridRowCount(blocks.map((block) => block.layout));
    const rowTrack = { gridTemplateRows: `repeat(${rowCount}, calc(100cqw / 12))` };

    function beginDrag(event: PointerEvent<HTMLElement>, block: PageBlock, mode: DragState["mode"]) {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {
            blockId: block.id,
            mode,
            pointerX: event.clientX,
            pointerY: event.clientY,
            origin: block.layout.desktop,
        };
    }

    function handlePointerMove(event: PointerEvent<HTMLElement>) {
        const drag = dragRef.current;
        const grid = gridRef.current;
        if (!drag || !grid) return;

        // cells are square, so one cell size covers both axes
        const cell = grid.getBoundingClientRect().width / GRID_COLUMNS;
        const columns = Math.round((event.clientX - drag.pointerX) / cell);
        const rows = Math.round((event.clientY - drag.pointerY) / cell);

        setBlocks((previous) => {
            const target = previous.find((block) => block.id === drag.blockId);
            if (!target) return previous;

            const next: BlockPosition =
                drag.mode === "move"
                    ? {
                          ...drag.origin,
                          col_start: drag.origin.col_start + columns,
                          row_start: drag.origin.row_start + rows,
                      }
                    : {
                          ...drag.origin,
                          col_span: drag.origin.col_span + columns,
                          row_span: drag.origin.row_span + rows,
                      };

            if (samePosition(target.layout.desktop, next)) return previous;
            if (!isWithinBounds(next)) return previous;

            // Only free space is a legal drop, so the block simply stops rather
            // than following the cursor into an occupied cell. This is what keeps
            // every batch the server sees collision-free.
            const candidate = { ...target.layout, desktop: next };
            const others = previous.filter((block) => block.id !== drag.blockId).map((block) => block.layout);
            if (wouldOverlap(candidate, others)) return previous;

            return previous.map((block) =>
                block.id === drag.blockId ? { ...block, layout: candidate } : block,
            );
        });
    }

    // No releasePointerCapture — the browser drops it implicitly on pointerup,
    // and calling it on an element that never captured throws.
    function endDrag() {
        dragRef.current = null;
    }

    function beginStagedDrag(event: PointerEvent<HTMLElement>, block: StagedBlock) {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        stagedRef.current = block;
        setDragging(true);
    }

    function cancelStagedDrag() {
        stagedRef.current = null;
        ghostRef.current = null;
        setGhost(null);
        setDragging(false);
    }

    function handleStagedMove(event: PointerEvent<HTMLElement>) {
        const block = stagedRef.current;
        const grid = gridRef.current;
        if (!block || !grid) return;

        const rect = grid.getBoundingClientRect();
        const { col, row } = cellAt(rect, event.clientX, event.clientY);
        const position = clampToGrid(col, row, block.span);

        // Clamping alone would happily place a block while the cursor is still
        // over the sidebar, so the cursor has to actually be on the grid.
        const over =
            event.clientX >= rect.left &&
            event.clientX <= rect.right &&
            event.clientY >= rect.top &&
            event.clientY <= rect.bottom;

        const candidate = { desktop: position, tablet: null, mobile: null };
        const next = {
            position,
            valid: over && !wouldOverlap(candidate, blocks.map((existing) => existing.layout)),
        };

        // pointermove fires far faster than the cell under it changes, so skip
        // the re-render unless something actually moved — same early-out as
        // handlePointerMove above
        const previous = ghostRef.current;
        if (previous && previous.valid === next.valid && samePosition(previous.position, next.position)) {
            return;
        }

        ghostRef.current = next;
        setGhost(next);
    }

    async function endStagedDrag() {
        const block = stagedRef.current;
        const drop = ghostRef.current;
        cancelStagedDrag();
        if (!block || !drop?.valid) return;

        setError(null);
        setPending(true);
        const result = await createPageBlock(storefront.slug, page.slug, {
            ...block.draft,
            layout: { desktop: drop.position, tablet: null, mobile: null },
            style: block.style,
        });
        setPending(false);

        if ("error" in result) {
            setError(result.error);
            return;
        }
        setBlocks((current) => [...current, result.block]);
        setStaged((current) => current.filter((entry) => entry.key !== block.key));
    }

    async function handleModalSubmit({ draft, style }: BlockSubmit): Promise<boolean> {
        if (modal?.mode === "create") {
            setStaged((current) => [
                ...current,
                { key: crypto.randomUUID(), draft, style, span: DEFAULT_SPANS[draft.kind] },
            ]);
            return true;
        }
        if (modal?.mode !== "edit") return false;

        setError(null);
        setPending(true);
        const result = await updatePageBlock(storefront.slug, page.slug, modal.blockId, {
            content: draft.content,
            style,
        });
        setPending(false);

        if ("error" in result) {
            setError(result.error);
            return false;
        }
        setBlocks((current) =>
            current.map((block) =>
                // the server's layout is discarded in favour of the local one:
                // a drag still inside the autosave debounce hasn't reached the
                // database yet, and taking the response's copy would undo it
                block.id === result.block.id ? { ...result.block, layout: block.layout } : block,
            ),
        );
        return true;
    }

    async function handleDelete() {
        if (modal?.mode !== "edit") return;
        if (!window.confirm("Delete this block? This can't be undone.")) return;

        const { blockId } = modal;
        setError(null);
        setPending(true);
        const result = await deletePageBlock(storefront.slug, page.slug, blockId);
        setPending(false);

        if (result?.error) {
            setError(result.error);
            return;
        }
        setBlocks((current) => current.filter((block) => block.id !== blockId));
        setModal(null);
    }

    const editingBlock =
        modal?.mode === "edit" ? blocks.find((block) => block.id === modal.blockId) : undefined;

    return (
        <>
            <EditorToolbar
                storefrontSlug={storefront.slug}
                title={page.title}
                status={status}
                onRetry={retry}
            />

            {/* Sibling of the grid wrapper, like the chrome below and for the
                same reason: the wrapper's container-type makes it a containing
                block for fixed descendants. */}
            <BlockSidebar
                staged={staged}
                dragging={dragging}
                onAdd={() => setModal({ mode: "create" })}
                onDiscard={(key) => setStaged((current) => current.filter((entry) => entry.key !== key))}
                onChipPointerDown={beginStagedDrag}
                onChipPointerMove={handleStagedMove}
                onChipPointerUp={endStagedDrag}
                onChipPointerCancel={cancelStagedDrag}
            />

            {/* Deliberately a sibling above the grid wrapper, never inside it.
                The wrapper is the positioning context for the `absolute inset-0`
                interaction overlay, so chrome placed within it would stretch the
                overlay across the chrome and offset every interaction cell from
                the block it targets. containerType also implies layout
                containment, which would trap any `fixed` descendant here.

                Nothing extra is needed to keep blocks out of this space:
                isWithinBounds already refuses row_start < 0, and row 0 is the
                top of the grid, which now sits below the chrome. */}
            {chrome}

            {/* Same shell as pageGrid: styleVars supplies the --sf-* base the
                blocks inherit, and containerType makes 100cqw resolve to this
                element's width so the row track matches the column width. */}
            <div
                style={{ ...styleVars(storefront.style), containerType: "inline-size" }}
                className="relative bg-[var(--sf-bg)] text-[var(--sf-fg)]"
            >
                {/* An explicit track count rather than pageGrid's gridAutoRows:
                    it keeps empty rows below the lowest block, without which an
                    empty page has no drop target at all. gridAutoRows stays as
                    the floor for anything placed past the end. */}
                <div
                    ref={gridRef}
                    className="grid grid-cols-12"
                    style={{ ...rowTrack, gridAutoRows: "calc(100cqw / 12)" }}
                >
                    {blocks.map((block) => (
                        <Block key={block.id} block={block} />
                    ))}
                </div>

                {/* Interaction lives in a parallel grid stacked on top rather than
                    wrapping each Block — Block *is* the grid item, so wrapping it
                    would detach it from the grid it's placed on. Both grids use the
                    same columns, row track and layout vars, so they stay aligned.
                    Empty cells stay click-through. */}
                <div
                    className="pointer-events-none absolute inset-0 grid grid-cols-12"
                    style={{ ...rowTrack, gridAutoRows: "calc(100cqw / 12)" }}
                >
                    {blocks.map((block) => (
                        <div
                            key={block.id}
                            style={blockLayoutVars(block.layout)}
                            className="page-block group pointer-events-auto relative cursor-grab touch-none outline-2 outline-transparent hover:outline-sky-500 active:cursor-grabbing"
                            onPointerDown={(event) => beginDrag(event, block, "move")}
                            onPointerMove={handlePointerMove}
                            onPointerUp={endDrag}
                            onPointerCancel={endDrag}
                        >
                            {/* No gear on product blocks: the modal has no form
                                that can express a product_id, so there would be
                                nothing for it to open. */}
                            {block.kind !== "product" && (
                                <Button
                                    variant="unstyled"
                                    aria-label="Edit block"
                                    // stopPropagation so pressing the gear opens
                                    // the modal instead of starting a move
                                    onPointerDown={(event) => event.stopPropagation()}
                                    onClick={() => setModal({ mode: "edit", blockId: block.id })}
                                    className="absolute top-0 right-0 bg-sky-500 px-1.5 py-0.5 text-xs leading-none text-white opacity-0 group-hover:opacity-100"
                                >
                                    ⚙
                                </Button>
                            )}

                            <div
                                // stopPropagation so the corner resizes instead of
                                // starting a move on the parent
                                onPointerDown={(event) => {
                                    event.stopPropagation();
                                    beginDrag(event, block, "resize");
                                }}
                                // revealed by hovering the block, not the handle
                                // itself — a 12px invisible target is unfindable
                                className="absolute right-0 bottom-0 size-3 cursor-nwse-resize touch-none bg-sky-500 opacity-0 group-hover:opacity-100"
                            />
                        </div>
                    ))}

                    {ghost && (
                        <div
                            style={blockLayoutVars({
                                desktop: ghost.position,
                                tablet: null,
                                mobile: null,
                            })}
                            className={`page-block pointer-events-none outline-2 outline-dashed ${
                                ghost.valid ? "bg-sky-500/20 outline-sky-500" : "bg-red-500/20 outline-red-500"
                            }`}
                        />
                    )}
                </div>
            </div>

            {modal && (
                <BlockModal
                    // remount per target so the form seeds from the right block
                    key={modal.mode === "edit" ? `edit-${modal.blockId}` : "create"}
                    block={editingBlock}
                    pending={pending}
                    onSubmit={handleModalSubmit}
                    onDelete={modal.mode === "edit" ? handleDelete : undefined}
                    onClose={() => setModal(null)}
                />
            )}

            {error && (
                <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 shadow-lg">
                    <span className="whitespace-pre-line">{error}</span>
                    <Button variant="link" onClick={() => setError(null)} className="text-red-700">
                        Dismiss
                    </Button>
                </div>
            )}
        </>
    );
}
