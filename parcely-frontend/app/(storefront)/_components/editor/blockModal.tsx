'use client';

import { useState } from "react";
import Button from "@/components/button";
import type { BlockDraft, DraftKind, PageBlock, PageBlockStyle } from "@/types/block";
import type { PageSummary } from "@/types/page";
import type { Product } from "@/types/product";
import type { Currency, StorefrontStyle } from "@/types/storefront";
import { isResolvedBlob } from "../pageblock/blocks/resolved";
import ImagePicker from "../storefront/form/imagePicker";
import BlockPreview, { layoutFor, previewBlock, type PreviewContent } from "./blockPreview";
import BlockStyleForm, { DEFAULT_PAGE_BLOCK_STYLE } from "./blockStyleForm";
import MediaListPicker, { type ExistingMedia } from "./mediaListPicker";
import Modal from "./modal";
import PagePicker from "./pagePicker";
import ProductPicker from "./product/productPicker";
import { KIND_LABELS, type BlockForm, type BlockRecipe, type Uploader } from "./stagedBlock";
import TextField from "./textField";

const KINDS: DraftKind[] = ["text", "media", "product", "gallery", "slideshow", "link"];

// Nothing is uploaded or written here. The recipe's files are turned into blob
// ids by the caller at Save, and `preview` is what stands in for the block on
// the canvas until then.
export type BlockSubmit = {
    recipe: BlockRecipe;
    preview: PageBlock;
};

function initialKind(block: PageBlock | undefined): DraftKind {
    return block?.kind ?? "text";
}

// Seeded from content, not resolved_content: content is the authoritative list
// of ids, and an edit has to send every one of them back or the ones it left out
// are deleted from the block as a side effect of saving something else. Entries
// that failed to resolve are carried through as ids with no preview rather than
// dropped.
//
// Zipped by index rather than looked up by id, because resolved_content lines up
// index-for-index with content and the same blob may legitimately appear twice.
function initialList(block: PageBlock | undefined): ExistingMedia[] {
    if (block?.kind !== "gallery" && block?.kind !== "slideshow") return [];

    const ids =
        block.kind === "gallery" ? block.content.gallery_ids : block.content.slideshow_ids;

    return ids.map((id, index) => {
        const entry = block.resolved_content[index];
        return { id, blob: entry !== undefined && isResolvedBlob(entry) ? entry : null };
    });
}

export default function BlockModal({
    block,
    seed,
    products,
    pages,
    storefrontSlug,
    currency,
    storefrontStyle,
    pending,
    onSubmit,
    onDelete,
    onClose,
}: {
    // absent in the create flow
    block?: PageBlock;
    // The form as this block was last left, for a block that has been composed
    // but not yet saved. It outranks `block`, which for an unsaved block is only
    // the canvas stand-in and may not even carry the right kind.
    seed?: BlockForm;
    // the whole catalogue, fetched by the route — the picker never loads
    products: Product[];
    // every page of the storefront, product pages included: pointing a link at
    // one is the reason the block exists
    pages: PageSummary[];
    storefrontSlug: string;
    currency: Currency;
    // what the preview inherits wherever a style field is left to the storefront
    storefrontStyle: StorefrontStyle;
    // a save is in flight; the page must not be edited out from under it
    pending: boolean;
    onSubmit: (value: BlockSubmit) => void;
    onDelete?: () => void;
    onClose: () => void;
}) {
    const [kind, setKind] = useState<DraftKind>(seed?.kind ?? initialKind(block));
    const [style, setStyle] = useState<PageBlockStyle>(
        seed?.style ?? block?.style ?? DEFAULT_PAGE_BLOCK_STYLE,
    );

    const [text, setText] = useState(
        seed?.text ?? (block?.kind === "text" ? block.content.text : ""),
    );
    // Seeded from content, not resolved_content, for the same reason as
    // initialList: the stored id has to survive an edit that never touched it.
    const [productId, setProductId] = useState<number | null>(
        seed?.productId ?? (block?.kind === "product" ? block.content.product_id : null),
    );
    const [mediaFile, setMediaFile] = useState<File | null>(seed?.mediaFile ?? null);

    const [pageId, setPageId] = useState<number | null>(
        seed?.pageId ?? (block?.kind === "link" ? block.content.page_id : null),
    );
    const [linkText, setLinkText] = useState(
        seed?.linkText ?? (block?.kind === "link" ? (block.content.text ?? "") : ""),
    );
    const [linkFile, setLinkFile] = useState<File | null>(seed?.linkFile ?? null);
    // Held in state rather than read off the block, because a link's media is
    // optional and so can actually be removed — unlike a media block's.
    const [linkMediaId, setLinkMediaId] = useState<number | null>(
        seed?.linkMediaId ?? (block?.kind === "link" ? (block.content.media_id ?? null) : null),
    );

    const [listFiles, setListFiles] = useState<File[]>(seed?.listFiles ?? []);
    const [existingList, setExistingList] = useState<ExistingMedia[]>(
        () => seed?.existingList ?? initialList(block),
    );

    const existingMediaUrl =
        block?.kind === "media" ? (block.resolved_content?.url ?? null) : null;
    const existingMediaId = block?.kind === "media" ? block.content.media_id : null;

    // gated on linkMediaId so pressing Remove clears the preview too
    const existingLinkUrl =
        block?.kind === "link" && linkMediaId !== null
            ? (block.resolved_content.media?.url ?? null)
            : null;

    const listCount = existingList.length + listFiles.length;

    // Files are staged, not uploaded, so they have no url the renderer could
    // use — the preview shows a caption in their place until the block is saved.
    const stagedFiles = (() => {
        switch (kind) {
            case "media":
                return mediaFile ? 1 : 0;
            case "link":
                return linkFile ? 1 : 0;
            case "gallery":
            case "slideshow":
                return listFiles.length;
            default:
                return 0;
        }
    })();

    const previewContent: PreviewContent = {
        text,
        productId,
        pageId,
        linkText,
        linkMedia:
            block?.kind === "link" && linkMediaId !== null ? block.resolved_content.media : null,
        media: block?.kind === "media" ? block.resolved_content : null,
        list: existingList,
        stagedFiles,
    };

    // Rendered below and submitted as-is, so what the owner approves in the
    // preview is exactly what appears on the canvas.
    const preview = previewBlock({
        kind,
        style,
        layout: layoutFor(kind, block),
        content: previewContent,
        products,
        pages,
    });

    // A media block has no valid empty state, so its picker offers replace but
    // not remove; gallery and slideshow just need to keep at least one entry.
    const canSubmit = (() => {
        switch (kind) {
            case "text":
                return text.trim().length > 0;
            case "media":
                return mediaFile !== null || existingMediaId !== null;
            case "product":
                return productId !== null;
            case "gallery":
            case "slideshow":
                return listCount > 0;
            // a link with neither media nor text would render as nothing to
            // click, which the backend schema rejects too
            case "link":
                return (
                    pageId !== null &&
                    (linkText.trim().length > 0 || linkFile !== null || linkMediaId !== null)
                );
        }
    })();

    // Shown on the sidebar chip, computed here because a staged block has no
    // draft to derive it from until it is dropped.
    const summary = (() => {
        switch (kind) {
            case "text": {
                const value = text.trim();
                return value.length > 40 ? `${value.slice(0, 40)}…` : value;
            }
            case "media":
                return "1 file";
            // the chip is only alive between Add and the drop, so an id is
            // enough to tell two staged products apart
            case "product":
                return `#${productId}`;
            case "gallery":
            case "slideshow":
                return `${listCount} items`;
            // the text when there is one, otherwise the target it points at
            case "link":
                return linkText.trim() || `→ #${pageId}`;
        }
    })();

    // Takes its uploader rather than closing over one: when staging, this runs
    // after the modal is gone, against the editor's uploader instead.
    const buildDraft = async (upload: Uploader): Promise<BlockDraft> => {
        switch (kind) {
            case "text":
                return { kind: "text", content: { text: text.trim() } };
            case "media": {
                const id = mediaFile ? await upload(mediaFile) : existingMediaId;
                return { kind: "media", content: { media_id: id as number } };
            }
            case "product":
                return { kind: "product", content: { product_id: productId as number } };
            case "gallery":
            case "slideshow": {
                // every id still on the block, then the newly staged ones — the
                // order shown in the picker
                const ids = existingList.map((item) => item.id);
                for (const file of listFiles) ids.push(await upload(file));
                return kind === "gallery"
                    ? { kind: "gallery", content: { gallery_ids: ids } }
                    : { kind: "slideshow", content: { slideshow_ids: ids } };
            }
            case "link": {
                const mediaId = linkFile ? await upload(linkFile) : linkMediaId;
                const text = linkText.trim();
                return {
                    kind: "link",
                    content: {
                        page_id: pageId as number,
                        media_id: mediaId,
                        text: text.length > 0 ? text : null,
                    },
                };
            }
        }
    };

    // Uploads nothing and writes nothing: the picked files ride along inside the
    // recipe's build, which the editor only runs at Save. A block composed here
    // and then discarded must not leave blobs behind.
    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!canSubmit) return;

        const form: BlockForm = {
            kind,
            style,
            text,
            productId,
            mediaFile,
            pageId,
            linkText,
            linkFile,
            linkMediaId,
            listFiles,
            existingList,
        };
        onSubmit({ recipe: { kind, summary, build: buildDraft, style, form }, preview });
        onClose();
    };

    const editing = block !== undefined;

    return (
        <Modal open onClose={onClose} title={editing ? `Edit ${KIND_LABELS[kind]} block` : "Add a block"}>
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                {/* Kind is fixed once a block exists: changing it would need the
                    content to change shape at the same time, and nothing about
                    the old content would carry over. */}
                {!editing && (
                    <div className="flex flex-wrap gap-2">
                        {KINDS.map((option) => (
                            <Button
                                key={option}
                                variant="chip"
                                active={kind === option}
                                onClick={() => setKind(option)}
                            >
                                {KIND_LABELS[option]}
                            </Button>
                        ))}
                    </div>
                )}

                {kind === "text" && <TextField value={text} onChange={setText} />}

                {kind === "media" && (
                    <ImagePicker
                        label="Image or video"
                        file={mediaFile}
                        onChange={setMediaFile}
                        existingUrl={existingMediaUrl}
                        // no onRemoveExisting: media_id is required, so the only
                        // legal edit is a replacement
                        accept="image/*,video/*"
                    />
                )}

                {kind === "product" && (
                    <ProductPicker
                        products={products}
                        value={productId}
                        onChange={setProductId}
                        storefrontSlug={storefrontSlug}
                        currency={currency}
                    />
                )}

                {kind === "link" && (
                    <>
                        <PagePicker pages={pages} value={pageId} onChange={setPageId} />

                        <label className="flex flex-col gap-1">
                            <span className="text-sm font-medium text-stone-700">
                                Text (optional)
                            </span>
                            <input
                                type="text"
                                value={linkText}
                                onChange={(e) => setLinkText(e.target.value)}
                                placeholder="Shop the collection"
                                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none"
                            />
                        </label>

                        <ImagePicker
                            label="Media (optional)"
                            file={linkFile}
                            onChange={setLinkFile}
                            existingUrl={existingLinkUrl}
                            // unlike the media block, media here is optional, so
                            // detaching it is a legal edit as long as text remains
                            onRemoveExisting={() => setLinkMediaId(null)}
                            accept="image/*,video/*"
                        />
                    </>
                )}

                {(kind === "gallery" || kind === "slideshow") && (
                    <MediaListPicker
                        label={KIND_LABELS[kind]}
                        files={listFiles}
                        onChange={setListFiles}
                        existing={existingList}
                        // by index, not id: the same blob can appear twice, and
                        // removing one copy must not take the other with it
                        onRemoveExisting={(index) =>
                            setExistingList((current) => current.filter((_, i) => i !== index))
                        }
                    />
                )}

                <BlockPreview
                    preview={preview}
                    storefrontSlug={storefrontSlug}
                    currency={currency}
                    storefrontStyle={storefrontStyle}
                />

                <BlockStyleForm value={style} onChange={setStyle} />

                <div className="flex items-center justify-between gap-3 border-t border-stone-200 pt-4">
                    {onDelete ? (
                        <Button
                            variant="outline"
                            disabled={pending}
                            onClick={onDelete}
                            className="border-red-300 text-red-700 hover:border-red-500"
                        >
                            Delete block
                        </Button>
                    ) : (
                        <span />
                    )}

                    <div className="flex items-center gap-3">
                        <Button variant="link" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={pending || !canSubmit}>
                            {editing ? "Done" : "Add"}
                        </Button>
                    </div>
                </div>
            </form>
        </Modal>
    );
}
