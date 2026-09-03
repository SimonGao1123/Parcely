'use server';

import { refresh } from "next/cache";
import { apiFetch } from "@/lib/api.server";
import { errorFrom } from "@/lib/api/formatErrors";

// max_capacity is subscription-only and display_image_id is optional; the model
// rejects a capacity on a one-time product, so the form omits it rather than
// sending null.
export type CreateProductInput = {
    name: string;
    description: string;
    is_subscription: boolean;
    is_active: boolean;
    max_capacity?: number | null;
    display_image_id?: number | null;
};

export async function createProduct(
    storefrontSlug: string,
    input: CreateProductInput,
): Promise<{ error: string } | void> {
    const response = await apiFetch(`/storefronts/${storefrontSlug}/products/`, {
        method: "POST",
        body: JSON.stringify(input),
    });

    if (!response.ok) {
        return { error: await errorFrom(response, "Failed to create product.") };
    }

    // No revalidatePath: a product nothing references yet can't change any
    // public page. Only the catalogue the caller is looking at needs to update.
    refresh();
}
