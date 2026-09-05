import type { BlockDraft, DraftKind, PageBlock, PageBlockStyle } from "@/types/block";
import type { ExistingMedia } from "./mediaListPicker";

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

// A block composed in the modal but not yet written to the server.
//
// build is deferred rather than a finished draft because turning the picked
// files into blob ids means uploading them, and an upload can't be undone: a
// block that is discarded, or left behind when the page is closed, would leave
// blobs in the bucket that nothing references. It runs at Save and nowhere else,
// which is what makes everything before Save free.
// Everything the modal's form held, so re-opening a block that hasn't been saved
// yet can put the owner back where they left off. Nothing else can reconstruct
// it: the canvas stand-in for an unsaved media block is a caption, and the
// picked File itself only exists here.
export type BlockForm = {
    kind: DraftKind;
    style: PageBlockStyle;
    text: string;
    productId: number | null;
    mediaFile: File | null;
    pageId: number | null;
    linkText: string;
    linkFile: File | null;
    linkMediaId: number | null;
    listFiles: File[];
    existingList: ExistingMedia[];
};

export type BlockRecipe = {
    kind: DraftKind;
    // for the chip, since there is no draft to derive it from yet
    summary: string;
    build: (upload: Uploader) => Promise<BlockDraft>;
    style: PageBlockStyle;
    form: BlockForm;
};

// A recipe waiting on the sidebar for somewhere to go. It has no id because it
// has no position yet — dropping it on the grid supplies both.
export type StagedBlock = BlockRecipe & {
    // local only, for the React key and for discarding the right chip
    key: string;
    span: BlockSpan;
    // What the canvas renders once it lands. A block that has never been saved
    // has no server resolved_content, so the modal's stand-in is all there is.
    preview: PageBlock;
};
