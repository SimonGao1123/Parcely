'use server';

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api.server";
import { errorFrom } from "@/lib/api/formatErrors";

// The slug is derived from the title server-side, so it is not sent.
export type CreatePageInput = {
    title: string;
    logo_image_id?: number | null;
};

export async function createPage(
    storefrontSlug: string,
    input: CreatePageInput,
): Promise<{ error: string } | void> {
    const response = await apiFetch(`/storefronts/${storefrontSlug}/pages/create/`, {
        method: "POST",
        body: JSON.stringify(input),
    });

    if (!response.ok) {
        return { error: await errorFrom(response, "Failed to create page.") };
    }

    // "layout" because the page list drives the storefront navbar, which is
    // rendered by (public)/layout.tsx for every page under this storefront.
    revalidatePath(`/${storefrontSlug}`, "layout");
}
