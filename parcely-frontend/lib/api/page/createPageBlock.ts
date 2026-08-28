'use server';

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api.server";
import { errorFrom } from "@/lib/api/formatErrors";
import type { BlockDraft, PageBlock, PageBlockLayout, PageBlockStyle } from "@/types/block";

// style is omitted rather than defaulted here — the model supplies
// default_page_block_style and save() normalizes it, so an absent key is the
// same as sending every field null.
export type CreatePageBlockInput = BlockDraft & {
    layout: PageBlockLayout;
    style?: PageBlockStyle;
};

// Returns the block rather than void: the caller needs the server-assigned id
// before it can put the block into editor state, since the layout autosave keys
// off ids and the layout endpoint rejects any it doesn't recognise.
export async function createPageBlock(
    storefrontSlug: string,
    pageSlug: string,
    input: CreatePageBlockInput,
): Promise<{ block: PageBlock } | { error: string }> {
    const response = await apiFetch(
        `/storefronts/${storefrontSlug}/pages/${pageSlug}/blocks/create/`,
        { method: "POST", body: JSON.stringify(input) },
    );

    if (!response.ok) {
        return { error: await errorFrom(response, "Failed to add block.") };
    }

    // "layout" because a block is visible on the public page, which is rendered
    // under the storefront layout
    revalidatePath(`/${storefrontSlug}`, "layout");

    return { block: (await response.json()) as PageBlock };
}
