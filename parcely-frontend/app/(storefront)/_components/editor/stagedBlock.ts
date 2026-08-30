import type { BlockDraft, DraftKind, PageBlockStyle } from "@/types/block";

export type BlockSpan = { col_span: number; row_span: number };

// Seeds only — a block is resized on the grid once it lands, so these just need
// to be plausible and to fit inside the 12 columns.
export const DEFAULT_SPANS: Record<DraftKind, BlockSpan> = {
    text: { col_span: 3, row_span: 2 },
    media: { col_span: 3, row_span: 3 },
    // wider than the rest: a product sits image-left / details-right
    product: { col_span: 8, row_span: 4 },
    gallery: { col_span: 5, row_span: 5 },
    slideshow: { col_span: 3, row_span: 3 },
    // tile-sized: several of these in a row is the point
    link: { col_span: 3, row_span: 3 },
};

export const KIND_LABELS: Record<DraftKind, string> = {
    text: "Text",
    media: "Media",
    product: "Product",
    gallery: "Gallery",
    slideshow: "Slideshow",
    link: "Link",
};

export type Uploader = (file: File) => Promise<number>;

// A block composed in the modal but not yet created.
//
// build is deferred rather than a finished draft because turning the picked
// files into blob ids means uploading them, and an upload can't be undone: a
// chip that is discarded, or left behind when the page is closed, would leave
// blobs in the bucket that nothing references. Running it at the drop is what
// makes staging free.
export type BlockRecipe = {
    kind: DraftKind;
    // for the chip, since there is no draft to derive it from yet
    summary: string;
    build: (upload: Uploader) => Promise<BlockDraft>;
    style: PageBlockStyle;
};

// It has no id because it has no position yet — dropping it on the grid is what
// supplies both, in the same request.
export type StagedBlock = BlockRecipe & {
    // local only, for the React key and for discarding the right chip
    key: string;
    span: BlockSpan;
};
