'use server';

import { refresh, revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api.server";
import { errorFrom } from "@/lib/api/formatErrors";

// Every key optional because this is a PATCH: an omitted key leaves the field
// alone, an explicit null clears it. That distinction is the whole reason
// display_image_id is nullable rather than just absent.
export type UpdateProductInput = {
    name?: string;
    description?: string;
    is_subscription?: boolean;
    is_active?: boolean;
    max_capacity?: number | null;
    display_image_id?: number | null;
};

export async function updateProduct(
    storefrontSlug: string,
    productId: number,
    input: UpdateProductInput,
): Promise<{ error: string } | void> {
    const response = await apiFetch(
        `/storefronts/${storefrontSlug}/products/${productId}/update/`,
        { method: "PATCH", body: JSON.stringify(input) },
    );

    if (!response.ok) {
        return { error: await errorFrom(response, "Failed to save product.") };
    }

    // "layout" because a product block can sit on any page in the storefront,
    // and a rename or a price change has to reach every one of them.
    revalidatePath(`/${storefrontSlug}`, "layout");
    refresh();
}
