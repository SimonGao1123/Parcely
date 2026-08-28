'use client';

import { useRef, useState } from "react";
import Button from "@/components/button";
import { useUploadFile } from "@/lib/api/s3/uploadFile";
import type { BlockDraft, DraftKind, PageBlock, PageBlockStyle } from "@/types/block";
import type { MediaBlob } from "@/types/blob";
import { isResolvedBlob } from "../pageblock/blocks/resolved";
import ImagePicker from "../storefront/form/imagePicker";
import BlockStyleForm, { DEFAULT_PAGE_BLOCK_STYLE } from "./blockStyleForm";
import MediaListPicker from "./mediaListPicker";
import Modal from "./modal";
import { KIND_LABELS } from "./stagedBlock";

const KINDS: DraftKind[] = ["text", "media", "gallery", "slideshow"];

export type BlockSubmit = { draft: BlockDraft; style: PageBlockStyle };

// Product blocks can't be edited here either, so a product block's gear has
// nothing to open — PageEditor is what keeps one from being passed in.
function initialKind(block: PageBlock | undefined): DraftKind {
    return block && block.kind !== "product" ? block.kind : "text";
}

function initialList(block: PageBlock | undefined): MediaBlob[] {
    if (block?.kind !== "gallery" && block?.kind !== "slideshow") return [];
    // Unresolvable entries come back as raw ids and are dropped rather than
    // carried forward — they are references to blobs that are already gone, so
    // re-sending them would just fail validation.
    return block.resolved_content.filter(isResolvedBlob);
}

export default function BlockModal({
    block,
    pending,
    onSubmit,
    onDelete,
    onClose,
}: {
    // absent in the create flow
    block?: PageBlock;
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
    const [mediaFile, setMediaFile] = useState<File | null>(null);
    const [listFiles, setListFiles] = useState<File[]>([]);
    const [existingList, setExistingList] = useState<MediaBlob[]>(() => initialList(block));

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

    const listCount = existingList.length + listFiles.length;

    // A media block has no valid empty state, so its picker offers replace but
    // not remove; gallery and slideshow just need to keep at least one entry.
    const canSubmit = (() => {
        switch (kind) {
            case "text":
                return text.trim().length > 0;
            case "media":
                return mediaFile !== null || existingMediaId !== null;
            case "gallery":
            case "slideshow":
                return listCount > 0;
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
            case "gallery":
            case "slideshow": {
                // stored first, then newly staged — the order shown in the picker
                const ids = [...existingList.map((blob) => blob.id)];
                for (const file of listFiles) ids.push(await uploadOnce(file));
                return kind === "gallery"
                    ? { kind: "gallery", content: { gallery_ids: ids } }
                    : { kind: "slideshow", content: { slideshow_ids: ids } };
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

                {(kind === "gallery" || kind === "slideshow") && (
                    <MediaListPicker
                        label={KIND_LABELS[kind]}
                        files={listFiles}
                        onChange={setListFiles}
                        existing={existingList}
                        onRemoveExisting={(id) =>
                            setExistingList((current) => current.filter((blob) => blob.id !== id))
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
