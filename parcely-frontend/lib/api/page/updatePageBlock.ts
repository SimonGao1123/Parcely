'use server';

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api.server";
import { errorFrom } from "@/lib/api/formatErrors";
import type { BlockContent, PageBlock, PageBlockStyle } from "@/types/block";

// No layout key, deliberately. This endpoint saves one block at a time and
// PageBlock.save() re-validates the whole page's overlap afterwards, so a
// rearrangement sent through here fails on any intermediate state that
// overlaps — which is the entire reason updatePageLayout exists.
export type UpdatePageBlockInput = {
    content?: BlockContent;
    style?: PageBlockStyle;
};

export async function updatePageBlock(
    storefrontSlug: string,
    pageSlug: string,
    blockId: number,
    input: UpdatePageBlockInput,
): Promise<{ block: PageBlock } | { error: string }> {
    const response = await apiFetch(
        `/storefronts/${storefrontSlug}/pages/${pageSlug}/blocks/${blockId}/update/`,
        { method: "PATCH", body: JSON.stringify(input) },
    );

    if (!response.ok) {
        return { error: await errorFrom(response, "Failed to save block.") };
    }

    revalidatePath(`/${storefrontSlug}`, "layout");

    return { block: (await response.json()) as PageBlock };
}
