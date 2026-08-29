'use server';

import { refresh, revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api.server";
import { errorFrom } from "@/lib/api/formatErrors";

// Any product block still pointing at this id is detached, not removed: content
// holds product_id as raw JSON with no FK, so block_reference_context simply
// stops resolving it and ProductBlock renders nothing. Same rule as the blobs
// behind media blocks.
export async function deleteProduct(
    storefrontSlug: string,
    productId: number,
): Promise<{ error: string } | void> {
    const response = await apiFetch(
        `/storefronts/${storefrontSlug}/products/${productId}/delete/`,
        { method: "DELETE" },
    );

    if (!response.ok) {
        return { error: await errorFrom(response, "Failed to delete product.") };
    }

    revalidatePath(`/${storefrontSlug}`, "layout");
    refresh();
}
