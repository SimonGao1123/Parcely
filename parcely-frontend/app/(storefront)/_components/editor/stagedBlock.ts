import type { BlockDraft, DraftKind, PageBlockStyle } from "@/types/block";

export type BlockSpan = { col_span: number; row_span: number };

// Seeds only — a block is resized on the grid once it lands, so these just need
// to be plausible and to fit inside the 12 columns.
export const DEFAULT_SPANS: Record<DraftKind, BlockSpan> = {
    text: { col_span: 6, row_span: 2 },
    media: { col_span: 6, row_span: 4 },
    gallery: { col_span: 12, row_span: 6 },
    slideshow: { col_span: 12, row_span: 6 },
};

export const KIND_LABELS: Record<DraftKind, string> = {
    text: "Text",
    media: "Media",
    gallery: "Gallery",
    slideshow: "Slideshow",
};

// A block composed in the modal but not yet created. It has no id because it
// has no position yet — dropping it on the grid is what supplies both, in the
// same request.
//
// draft is nested rather than spread in so that `key` and `span`, which are
// local bookkeeping, can't leak into the create payload.
export type StagedBlock = {
    // local only, for the React key and for discarding the right chip
    key: string;
    draft: BlockDraft;
    style: PageBlockStyle;
    span: BlockSpan;
};

export function draftSummary(draft: BlockDraft): string {
    switch (draft.kind) {
        case "text": {
            const text = draft.content.text.trim();
            return text.length > 40 ? `${text.slice(0, 40)}…` : text;
        }
        case "media":
            return "1 file";
        case "gallery":
            return `${draft.content.gallery_ids.length} items`;
        case "slideshow":
            return `${draft.content.slideshow_ids.length} items`;
    }
}
