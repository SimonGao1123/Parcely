import type { MediaBlob } from "@/types/blob";
import type { PageSummary } from "@/types/page";
import type { Product } from "@/types/product";
import type { Alignment, FontFamily } from "@/types/style";

export type BlockKind = "text" | "media" | "product" | "gallery" | "slideshow" | "link";

export type BlockPosition = {
    row_start: number;
    row_span: number;
    col_start: number;
    col_span: number;
};

// tablet/mobile fall back to desktop when null
export type PageBlockLayout = {
    desktop: BlockPosition;
    tablet: BlockPosition | null;
    mobile: BlockPosition | null;
};

// Every key is always present; null means "inherit from the storefront style".
export type PageBlockStyle = {
    background_color: string | null;
    font_family: FontFamily | null;
    font_scale: number | null;
    font_color: string | null;
    line_spacing: number | null;
    alignment: Alignment;
    padding: number | null;
};

export type TextContent = { text: string };
export type MediaContent = { media_id: number };
export type ProductContent = { product_id: number };
export type GalleryContent = { gallery_ids: number[] };
export type SlideshowContent = { slideshow_ids: number[] };
// page_id is required; media and text are each optional but at least one has to
// be there, or the link would render as nothing to click.
export type LinkContent = {
    page_id: number;
    media_id?: number | null;
    text?: string | null;
};

export type BlockContent =
    | TextContent
    | MediaContent
    | ProductContent
    | GalleryContent
    | SlideshowContent
    | LinkContent;

type PageBlockBase = {
    id: number;
    page: number;
    style: PageBlockStyle;
    layout: PageBlockLayout;
    created_at: string;
    updated_at: string;
};

// resolved_content is populated by page detail and by block create/update
// alike, so a null or a raw id always means the reference is gone — never
// "not loaded yet".

export type TextBlock = PageBlockBase & {
    kind: "text";
    content: TextContent;
    resolved_content: TextContent;
};

export type MediaBlock = PageBlockBase & {
    kind: "media";
    content: MediaContent;
    resolved_content: MediaBlob | null;
};

export type ProductBlock = PageBlockBase & {
    kind: "product";
    content: ProductContent;
    resolved_content: Product | null;
};

// Entries that can't be resolved stay in position as their raw id, so the array
// always lines up index-for-index with content.gallery_ids.
export type GalleryBlock = PageBlockBase & {
    kind: "gallery";
    content: GalleryContent;
    resolved_content: (MediaBlob | number)[];
};

export type SlideshowBlock = PageBlockBase & {
    kind: "slideshow";
    content: SlideshowContent;
    resolved_content: (MediaBlob | number)[];
};

// The target page is resolved server-side rather than stored on the block, so
// the slug is always current — renaming a page can't strand a link. `page` null
// means the page is gone; media/text mirror whichever half the block has.
export type ResolvedLink = {
    page: PageSummary | null;
    media: MediaBlob | null;
    text: string | null;
};

export type LinkBlock = PageBlockBase & {
    kind: "link";
    content: LinkContent;
    resolved_content: ResolvedLink;
};

export type PageBlock =
    | TextBlock
    | MediaBlock
    | ProductBlock
    | GalleryBlock
    | SlideshowBlock
    | LinkBlock;

// A block the editor has composed but not yet created, so there is no PageBlock
// to narrow through and kind/content have to be correlated on their own. That
// pairing is why this is spelled out rather than keyed on BlockKind.
export type BlockDraft =
    | { kind: "text"; content: TextContent }
    | { kind: "media"; content: MediaContent }
    | { kind: "product"; content: ProductContent }
    | { kind: "gallery"; content: GalleryContent }
    | { kind: "slideshow"; content: SlideshowContent }
    | { kind: "link"; content: LinkContent };

export type DraftKind = BlockDraft["kind"];
