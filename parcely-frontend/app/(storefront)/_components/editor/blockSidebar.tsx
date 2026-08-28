'use client';

import type { PointerEvent } from "react";
import Button from "@/components/button";
import { draftSummary, KIND_LABELS, type StagedBlock } from "./stagedBlock";

// Must be rendered as a sibling of the grid wrapper, never inside it: the
// wrapper sets container-type: inline-size, which implies layout containment and
// so makes it the containing block for any fixed descendant. Same rule as the
// editor chrome.
export default function BlockSidebar({
    staged,
    dragging,
    onAdd,
    onDiscard,
    onChipPointerDown,
    onChipPointerMove,
    onChipPointerUp,
    onChipPointerCancel,
}: {
    staged: StagedBlock[];
    // Holds the rail open for the length of a drag. Without it the pointer
    // leaves on the first move, hover is lost, and the chip being dragged is
    // clipped out of sight — the drag still works, but blind.
    dragging: boolean;
    onAdd: () => void;
    onDiscard: (key: string) => void;
    // The chip captures the pointer, so it keeps receiving moves while the
    // cursor is out over the grid — which is why all four live here rather
    // than on the drop target.
    onChipPointerDown: (event: PointerEvent<HTMLElement>, block: StagedBlock) => void;
    onChipPointerMove: (event: PointerEvent<HTMLElement>) => void;
    onChipPointerUp: () => void;
    onChipPointerCancel: () => void;
}) {
    return (
        // overflow-hidden is load-bearing: the panel inside is always full
        // width, and an opacity-0 element still hit-tests, so without clipping
        // the collapsed rail would swallow every click down the left of the page.
        <div
            className={`group fixed top-0 left-0 z-40 flex h-full flex-col overflow-hidden border-r border-stone-200 bg-stone-50 transition-[width] duration-200 ${
                dragging ? "w-64" : "w-3 hover:w-64"
            }`}
        >
            <div
                className={`flex h-full w-64 flex-col gap-3 overflow-y-auto p-4 transition-opacity duration-200 ${
                    dragging ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                }`}
            >
                <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-stone-800">Blocks</span>
                    <Button variant="outline" onClick={onAdd} aria-label="Add a block">
                        ＋
                    </Button>
                </div>

                <p className="text-xs text-stone-500">
                    {staged.length === 0
                        ? "Add a block, then drag it onto the page."
                        : "Drag a block onto a free space on the page."}
                </p>

                <ul className="flex flex-col gap-2">
                    {staged.map((block) => (
                        <li
                            key={block.key}
                            // touch-none so a drag on a touchscreen doesn't get
                            // taken over by scrolling, same as the grid cells
                            className="flex cursor-grab touch-none items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 active:cursor-grabbing"
                            onPointerDown={(event) => onChipPointerDown(event, block)}
                            onPointerMove={onChipPointerMove}
                            onPointerUp={onChipPointerUp}
                            // a cancelled gesture aborts rather than drops — the
                            // browser took the pointer away, the user didn't
                            // choose a cell
                            onPointerCancel={onChipPointerCancel}
                        >
                            <span className="flex-1 overflow-hidden">
                                <span className="block text-sm font-medium text-stone-800">
                                    {KIND_LABELS[block.draft.kind]}
                                </span>
                                <span className="block truncate text-xs text-stone-500">
                                    {draftSummary(block.draft)}
                                </span>
                            </span>

                            <Button
                                variant="unstyled"
                                aria-label={`Discard ${KIND_LABELS[block.draft.kind]} block`}
                                // or pressing it would start a drag instead
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={() => onDiscard(block.key)}
                                className="text-stone-400 hover:text-stone-800"
                            >
                                ✕
                            </Button>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
