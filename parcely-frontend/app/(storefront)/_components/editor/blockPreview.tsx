'use client';

import type { CSSProperties } from "react";
import type { MediaBlob } from "@/types/blob";
import type { DraftKind, PageBlock, PageBlockStyle } from "@/types/block";
import type { PageSummary } from "@/types/page";
import type { Product } from "@/types/product";
import type { Currency, StorefrontStyle } from "@/types/storefront";
import Block from "../pageblock/block";
import { styleVars } from "../storefront/styleVars";
import { DEFAULT_SPANS } from "./stagedBlock";
import type { ExistingMedia } from "./mediaListPicker";

// Block reads none of these, so the preview leaves them as placeholders. The
// editor overwrites id when it stages the same stand-in on the canvas, where it
// does have to be unique.
const BASE = { id: 0, page: 0, created_at: "", updated_at: "" };

export type PreviewContent = {
    text: string;
    productId: number | null;
    pageId: number | null;
    linkText: string;
    linkMedia: MediaBlob | null;
    media: MediaBlob | null;
    // gallery and slideshow share a picker, so they share this
    list: ExistingMedia[];
    // set once a file is picked but not yet uploaded, which is what the caption
    // path exists for
    stagedFiles: number;
};

// Normalised to the origin: the preview grid holds one block, so the stored
// position would only push it off-canvas. The span is kept, which is what gives
// the preview the block's real proportions. The editor overrides it with the
// block's real layout when the same stand-in goes onto the canvas.
export function layoutFor(kind: DraftKind, block: PageBlock | undefined): PageBlock["layout"] {
    const span = block?.layout.desktop ?? DEFAULT_SPANS[kind];
    return {
        desktop: {
            row_start: 0,
            col_start: 0,
            row_span: span.row_span,
            col_span: span.col_span,
        },
        tablet: null,
        mobile: null,
    };
}

// Turns raw form state into something Block can render, standing in for the
// server's resolved_content. Used for the modal's live preview and, once the
// block is staged, for the editor canvas too — until Save the block has no
// server copy to render from.
export function previewBlock({
    kind,
    style,
    layout,
    content,
    products,
    pages,
}: {
    kind: DraftKind;
    style: PageBlockStyle;
    layout: PageBlock["layout"];
    content: PreviewContent;
    products: Product[];
    pages: PageSummary[];
}): PageBlock {
    const base = { ...BASE, style, layout };
    const unsaved = `${content.stagedFiles} new file${content.stagedFiles === 1 ? "" : "s"} — preview appears once saved`;

    // A block whose content can't be rendered yet still has to show its styling,
    // so the fallback is a text block rather than nothing: it goes through the
    // same Block shell and inherits the live colours, font, scale, padding and
    // alignment.
    const caption = (text: string): PageBlock => ({
        ...base,
        kind: "text",
        content: { text },
        resolved_content: { text },
    });

    switch (kind) {
        case "text":
            return content.text.trim()
                ? { ...base, kind: "text", content: { text: content.text }, resolved_content: { text: content.text } }
                : caption("Write something to preview it");

        case "product": {
            const product = products.find((p) => p.id === content.productId);
            return product
                ? {
                      ...base,
                      kind: "product",
                      content: { product_id: product.id },
                      resolved_content: product,
                  }
                : caption("Pick a product to preview it");
        }

        case "media":
            if (content.stagedFiles > 0) return caption(unsaved);
            return content.media
                ? {
                      ...base,
                      kind: "media",
                      content: { media_id: content.media.id },
                      resolved_content: content.media,
                  }
                : caption("Pick an image or video to preview it");

        case "gallery":
        case "slideshow": {
            // Entries whose blob failed to resolve are dropped rather than kept
            // as ids: both renderers filter them out anyway.
            const blobs = content.list.flatMap((item) => (item.blob ? [item.blob] : []));
            if (blobs.length === 0) {
                return caption(content.stagedFiles > 0 ? unsaved : "Add media to preview it");
            }
            const ids = blobs.map((blob) => blob.id);
            return kind === "gallery"
                ? { ...base, kind: "gallery", content: { gallery_ids: ids }, resolved_content: blobs }
                : { ...base, kind: "slideshow", content: { slideshow_ids: ids }, resolved_content: blobs };
        }

        case "link": {
            const page = pages.find((p) => p.id === content.pageId);
            if (!page) return caption("Pick a page to preview this link");
            return {
                ...base,
                kind: "link",
                content: {
                    page_id: page.id,
                    media_id: content.linkMedia?.id ?? null,
                    text: content.linkText.trim() || null,
                },
                resolved_content: {
                    page,
                    media: content.stagedFiles > 0 ? null : content.linkMedia,
                    text: content.linkText.trim() || null,
                },
            };
        }
    }
}

export default function BlockPreview({
    preview,
    storefrontSlug,
    currency,
    storefrontStyle,
}: {
    // computed by the caller, which submits the same stand-in when the block is
    // staged — recomputing here would let the two drift apart
    preview: PageBlock;
    storefrontSlug: string;
    currency: Currency;
    // A block style holds overrides only, so without the storefront's values
    // underneath every "inherits" field would render unstyled.
    storefrontStyle: StorefrontStyle;
}) {
    // Mirrors the editor canvas: page-block places itself with grid-column and
    // grid-row, which mean nothing outside a 12-column grid, and the cqw row
    // height needs an inline-size container to measure against.
    const grid: CSSProperties = {
        ...styleVars(storefrontStyle),
        containerType: "inline-size",
        gridAutoRows: "calc(100cqw / 12)",
    };

    return (
        <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-stone-700">Preview</span>
            {/* Nothing inside is reachable: a product block renders a working
                Add to cart and a link block a real Link out of the editor. */}
            <div
                aria-hidden
                className="grid grid-cols-12 overflow-hidden rounded-lg border border-stone-200 [&_*]:pointer-events-none"
                style={grid}
            >
                <Block block={preview} storefrontSlug={storefrontSlug} currency={currency} />
            </div>
        </div>
    );
}
