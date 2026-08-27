import type { MediaBlob } from "@/types/blob";
import type { Product } from "@/types/product";
import type { Alignment, FontFamily } from "@/types/style";

export type BlockKind = "text" | "media" | "product" | "gallery" | "slideshow";

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

export type BlockContent =
    | TextContent
    | MediaContent
    | ProductContent
    | GalleryContent
    | SlideshowContent;

type PageBlockBase = {
    id: number;
    page: number;
    style: PageBlockStyle;
    layout: PageBlockLayout;
    created_at: string;
    updated_at: string;
};

// resolved_content is only populated by the page-detail endpoint. Block
// create/update responses leave references unresolved, so treat the null /
// raw-id cases as "not loaded yet" there and as "deleted" on page detail.

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

export type PageBlock =
    | TextBlock
    | MediaBlock
    | ProductBlock
    | GalleryBlock
    | SlideshowBlock;
