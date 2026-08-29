'use client';

import { useRef, useState } from "react";
import Button from "@/components/button";
import { useUploadFile } from "@/lib/api/s3/uploadFile";
import type { BlockDraft, DraftKind, PageBlock, PageBlockStyle } from "@/types/block";
import type { PageSummary } from "@/types/page";
import type { Product } from "@/types/product";
import { isResolvedBlob } from "../pageblock/blocks/resolved";
import ImagePicker from "../storefront/form/imagePicker";
import BlockStyleForm, { DEFAULT_PAGE_BLOCK_STYLE } from "./blockStyleForm";
import MediaListPicker, { type ExistingMedia } from "./mediaListPicker";
import Modal from "./modal";
import PagePicker from "./pagePicker";
import ProductPicker from "./product/productPicker";
import { KIND_LABELS } from "./stagedBlock";

const KINDS: DraftKind[] = ["text", "media", "product", "gallery", "slideshow", "link"];

export type BlockSubmit = { draft: BlockDraft; style: PageBlockStyle };

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
    products,
    pages,
    storefrontSlug,
    pending,
    onSubmit,
    onDelete,
    onClose,
}: {
    // absent in the create flow
    block?: PageBlock;
    // the whole catalogue, fetched by the route — the picker never loads
    products: Product[];
    // every page of the storefront, product pages included: pointing a link at
    // one is the reason the block exists
    pages: PageSummary[];
    storefrontSlug: string;
    pending: boolean;
    // resolves true when the caller accepted it, which is what closes the modal
    onSubmit: (value: BlockSubmit) => Promise<boolean>;
    onDelete?: () => void;
    onClose: () => void;
}) {
    const { upload, uploading } = useUploadFile();

    const [kind, setKind] = useState<DraftKind>(() => initialKind(block));
    const [style, setStyle] = useState<PageBlockStyle>(block?.style ?? DEFAULT_PAGE_BLOCK_STYLE);
    const [error, setError] = useState<string | null>(null);

    const [text, setText] = useState(block?.kind === "text" ? block.content.text : "");
    // Seeded from content, not resolved_content, for the same reason as
    // initialList: the stored id has to survive an edit that never touched it.
    const [productId, setProductId] = useState<number | null>(
        block?.kind === "product" ? block.content.product_id : null,
    );
    const [mediaFile, setMediaFile] = useState<File | null>(null);

    const [pageId, setPageId] = useState<number | null>(
        block?.kind === "link" ? block.content.page_id : null,
    );
    const [linkText, setLinkText] = useState(
        block?.kind === "link" ? (block.content.text ?? "") : "",
    );
    const [linkFile, setLinkFile] = useState<File | null>(null);
    // Held in state rather than read off the block, because a link's media is
    // optional and so can actually be removed — unlike a media block's.
    const [linkMediaId, setLinkMediaId] = useState<number | null>(
        block?.kind === "link" ? (block.content.media_id ?? null) : null,
    );

    const [listFiles, setListFiles] = useState<File[]>([]);
    const [existingList, setExistingList] = useState<ExistingMedia[]>(() => initialList(block));

    // Confirmed blobs are permanent, so a failed submit must not upload a second
    // copy on retry. Same cache as pageForm and storefrontSettings.
    const blobIds = useRef(new Map<File, number>());

    const uploadOnce = async (file: File) => {
        const cached = blobIds.current.get(file);
        if (cached !== undefined) return cached;
        const id = await upload(file);
        blobIds.current.set(file, id);
        return id;
    };

    const existingMediaUrl =
        block?.kind === "media" ? (block.resolved_content?.url ?? null) : null;
    const existingMediaId = block?.kind === "media" ? block.content.media_id : null;

    // gated on linkMediaId so pressing Remove clears the preview too
    const existingLinkUrl =
        block?.kind === "link" && linkMediaId !== null
            ? (block.resolved_content.media?.url ?? null)
            : null;

    const listCount = existingList.length + listFiles.length;

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

    const buildDraft = async (): Promise<BlockDraft> => {
        switch (kind) {
            case "text":
                return { kind: "text", content: { text: text.trim() } };
            case "media": {
                const id = mediaFile ? await uploadOnce(mediaFile) : existingMediaId;
                return { kind: "media", content: { media_id: id as number } };
            }
            case "product":
                return { kind: "product", content: { product_id: productId as number } };
            case "gallery":
            case "slideshow": {
                // every id still on the block, then the newly staged ones — the
                // order shown in the picker
                const ids = existingList.map((item) => item.id);
                for (const file of listFiles) ids.push(await uploadOnce(file));
                return kind === "gallery"
                    ? { kind: "gallery", content: { gallery_ids: ids } }
                    : { kind: "slideshow", content: { slideshow_ids: ids } };
            }
            case "link": {
                const mediaId = linkFile ? await uploadOnce(linkFile) : linkMediaId;
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

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!canSubmit) return;

        setError(null);

        let draft: BlockDraft;
        try {
            draft = await buildDraft();
        } catch (uploadError) {
            setError(uploadError instanceof Error ? uploadError.message : String(uploadError));
            return;
        }

        if (await onSubmit({ draft, style })) onClose();
    };

    const busy = pending || uploading;
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

                {kind === "text" && (
                    <label className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-stone-700">Text</span>
                        <textarea
                            value={text}
                            rows={5}
                            onChange={(e) => setText(e.target.value)}
                            placeholder="Write something…"
                            className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none"
                        />
                    </label>
                )}

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

                <BlockStyleForm value={style} onChange={setStyle} />

                {error && (
                    <p className="whitespace-pre-line rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {error}
                    </p>
                )}

                <div className="flex items-center justify-between gap-3 border-t border-stone-200 pt-4">
                    {onDelete ? (
                        <Button
                            variant="outline"
                            disabled={busy}
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
                        <Button type="submit" disabled={busy || !canSubmit}>
                            {uploading ? "Uploading…" : editing ? "Save" : "Add"}
                        </Button>
                    </div>
                </div>
            </form>
        </Modal>
    );
}
