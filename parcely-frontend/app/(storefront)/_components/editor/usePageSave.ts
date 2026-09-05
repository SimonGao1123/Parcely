import { useRef, useState } from "react";
import {
    savePageBlocks,
    type BlockCreate,
    type BlockUpdate,
} from "@/lib/api/page/savePageBlocks";
import { useUploadFile } from "@/lib/api/s3/uploadFile";
import type { PageBlock } from "@/types/block";
import type { BlockRecipe } from "./stagedBlock";

export type SaveStatus = "idle" | "uploading" | "saving" | "saved" | "error";

// Doubles as the change detector for moves and resizes: a fresh array every
// render can't be compared by identity, but this string is only unequal when a
// position actually changed. Created and deleted blocks are tracked separately,
// so this only has to speak for layout.
function layoutKey(blocks: PageBlock[]): string {
    return JSON.stringify(blocks.map((block) => [block.id, block.layout]));
}

export function usePageSave({
    storefrontSlug,
    pageSlug,
    // the page as the server last gave it to us, which is what `dirty` measures against
    baseline,
    blocks,
    // keyed by block id; a negative id is a block created in this session
    drafts,
    deleted,
    onSaved,
}: {
    storefrontSlug: string;
    pageSlug: string;
    baseline: PageBlock[];
    blocks: PageBlock[];
    drafts: Map<number, BlockRecipe>;
    deleted: number[];
    onSaved: (blocks: PageBlock[]) => void;
}) {
    const [status, setStatus] = useState<SaveStatus>("idle");
    const [error, setError] = useState<string | null>(null);
    // state, not a ref: `dirty` is read during render, so rebaselining after a
    // save has to be what schedules the re-render that clears it
    const [savedLayout, setSavedLayout] = useState(() => layoutKey(baseline));

    // Confirmed blobs are permanent, so a save that fails after uploading must
    // not upload a second copy when it is retried.
    const { upload } = useUploadFile();
    const blobIds = useRef(new Map<File, number>());

    const uploadOnce = async (file: File) => {
        const cached = blobIds.current.get(file);
        if (cached !== undefined) return cached;
        const id = await upload(file);
        blobIds.current.set(file, id);
        return id;
    };

    const dirty = drafts.size > 0 || deleted.length > 0 || layoutKey(blocks) !== savedLayout;

    async function save() {
        setError(null);
        setStatus("uploading");

        // Iterating blocks rather than drafts is what keeps the two in step: a
        // draft whose block is gone is simply never reached.
        const creates: BlockCreate[] = [];
        const updates: BlockUpdate[] = [];
        try {
            for (const block of blocks) {
                const recipe = drafts.get(block.id);
                if (!recipe) continue;

                // The upload finally happens here. Deferring it this long is why
                // composing a block and then discarding it leaves nothing behind.
                const draft = await recipe.build(uploadOnce);
                if (block.id < 0) {
                    creates.push({ ...draft, layout: block.layout, style: recipe.style });
                } else {
                    updates.push({ id: block.id, content: draft.content, style: recipe.style });
                }
            }
        } catch (uploadError) {
            setError(uploadError instanceof Error ? uploadError.message : String(uploadError));
            setStatus("error");
            return;
        }

        setStatus("saving");
        const result = await savePageBlocks(storefrontSlug, pageSlug, {
            deletes: deleted,
            // only blocks the server already knows about; the rest carry their
            // layout inside `creates`
            layout: blocks.filter((block) => block.id > 0).map(({ id, layout }) => ({ id, layout })),
            updates,
            creates,
        });

        if ("error" in result) {
            setError(result.error);
            setStatus("error");
            return;
        }

        setSavedLayout(layoutKey(result.blocks));
        setStatus("saved");
        onSaved(result.blocks);
    }

    return { dirty, status, error, save, dismissError: () => setError(null) };
}
