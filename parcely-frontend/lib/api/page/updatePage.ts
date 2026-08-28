'use server';

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api.server";
import { errorFrom } from "@/lib/api/formatErrors";

// Optional keys for the same reason as UpdateStorefrontInput: this is a PATCH,
// so omitting logo_image_id leaves the page's logo alone, while sending an
// explicit null detaches it.
export type UpdatePageInput = {
    title?: string;
    logo_image_id?: number | null;
};

// Renaming regenerates the page's slug, so its old URL stops resolving. The
// caller stays on /<storefrontSlug>/settings, which does not contain the page
// slug, so unlike updateStorefront there is no redirect to perform.
export async function updatePage(
    storefrontSlug: string,
    pageSlug: string,
    input: UpdatePageInput,
): Promise<{ error: string } | void> {
    const response = await apiFetch(`/storefronts/${storefrontSlug}/pages/${pageSlug}/update/`, {
        method: "PATCH",
        body: JSON.stringify(input),
    });

    if (!response.ok) {
        return { error: await errorFrom(response, "Failed to save page.") };
    }

    revalidatePath(`/${storefrontSlug}`, "layout");
}
