'use server';

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api.server";
import { errorFrom } from "@/lib/api/formatErrors";
import type { Currency, StorefrontStyle, Theme } from "@/types/storefront";

// Every key optional because this is a PATCH: an omitted key means "unchanged",
// which is a different instruction from an explicit null. That distinction is
// the whole reason ImagePicker grew a separate Remove control — sending
// logo_image_id: null detaches the image, omitting it leaves it alone.
export type UpdateStorefrontInput = {
    title?: string;
    description?: string | null;
    theme?: Theme;
    style?: StorefrontStyle;
    currency?: Currency;
    logo_image_id?: number | null;
    banner_image_id?: number | null;
    is_draft?: boolean;
};

export async function updateStorefront(
    slug: string,
    input: UpdateStorefrontInput,
): Promise<{ error: string } | void> {
    const response = await apiFetch(`/storefronts/${slug}/update/`, {
        method: "PATCH",
        body: JSON.stringify(input),
    });

    if (!response.ok) {
        return { error: await errorFrom(response, "Failed to save storefront.") };
    }

    const { slug: newSlug } = await response.json();

    // StoreFront.save() regenerates the slug from the title, so a rename moves
    // the storefront out from under the URL the caller is currently on.
    if (newSlug !== slug) {
        revalidatePath("/");
        revalidatePath(`/${slug}`, "layout");
        redirect(`/${newSlug}/settings`);
    }

    // "layout" because every price in the storefront is formatted with this
    // currency, and those are rendered on any page that carries a product block.
    if (input.currency !== undefined) {
        revalidatePath(`/${slug}`, "layout");
    }

    // is_draft decides whether the storefront appears in the public feed, which
    // is server-rendered from getStorefrontList.
    if (input.is_draft !== undefined) {
        revalidatePath("/");
        revalidatePath("/personal");
    }

    // Nothing to purge otherwise — the storefront pages are already dynamic.
    // This only drops the client router cache so the new values render.
    refresh();
}
