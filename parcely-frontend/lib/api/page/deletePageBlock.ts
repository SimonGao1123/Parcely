'use server';

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api.server";
import { errorFrom } from "@/lib/api/formatErrors";

// The blobs a media/gallery/slideshow block referenced are left in S3. Nothing
// tracks whether another block still points at them — content holds blob ids as
// raw JSON with no FK behind it — so deleting here could strand a live
// reference. Same detach-only rule as the storefront and page images.
export async function deletePageBlock(
    storefrontSlug: string,
    pageSlug: string,
    blockId: number,
): Promise<{ error: string } | void> {
    const response = await apiFetch(
        `/storefronts/${storefrontSlug}/pages/${pageSlug}/blocks/${blockId}/delete/`,
        { method: "DELETE" },
    );

    if (!response.ok) {
        return { error: await errorFrom(response, "Failed to delete block.") };
    }

    revalidatePath(`/${storefrontSlug}`, "layout");
}
