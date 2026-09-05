'use server';

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api.server";
import { errorFrom } from "@/lib/api/formatErrors";
import type {
    BlockContent,
    BlockDraft,
    PageBlock,
    PageBlockLayout,
    PageBlockStyle,
} from "@/types/block";

export type BlockCreate = BlockDraft & {
    layout: PageBlockLayout;
    style: PageBlockStyle;
};

// No layout: existing blocks are repositioned through `layout` instead, which is
// applied as one batch. Sent per block it would fail on any rearrangement whose
// intermediate state overlaps.
export type BlockUpdate = {
    id: number;
    content: BlockContent;
    style: PageBlockStyle;
};

export type SavePageBlocksInput = {
    deletes: number[];
    layout: { id: number; layout: PageBlockLayout }[];
    updates: BlockUpdate[];
    creates: BlockCreate[];
};

// The editor holds a whole session's changes and commits them here at once. One
// request rather than four because the server applies them in a single
// transaction: sent separately they can half-apply, leaving the page in a state
// nobody asked for.
//
// The response carries every block on the page, not just the changed ones. The
// editor replaces its state with it wholesale, which is what swaps the local
// placeholder ids of newly created blocks for real ones.
export async function savePageBlocks(
    storefrontSlug: string,
    pageSlug: string,
    input: SavePageBlocksInput,
): Promise<{ blocks: PageBlock[] } | { error: string }> {
    const response = await apiFetch(
        `/storefronts/${storefrontSlug}/pages/${pageSlug}/blocks/batch/`,
        { method: "PATCH", body: JSON.stringify(input) },
    );

    if (!response.ok) {
        return { error: await errorFrom(response, "Failed to save the page.") };
    }

    // "layout" because blocks are visible on the public page, which is rendered
    // under the storefront layout
    revalidatePath(`/${storefrontSlug}`, "layout");

    const body = (await response.json()) as { blocks: PageBlock[] };
    return { blocks: body.blocks };
}
