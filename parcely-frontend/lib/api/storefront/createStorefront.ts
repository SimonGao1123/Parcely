'use server';

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api.server";
import { errorFrom } from "@/lib/api/formatErrors";
import type { StorefrontStyle, Theme } from "@/types/storefront";

export type CreateStorefrontInput = {
    title: string;
    description: string | null;
    theme: Theme;
    style: StorefrontStyle;
    logo_image_id: number | null;
    banner_image_id: number | null;
};

// Errors come back as data rather than thrown: redirect() signals itself by
// throwing, so a caller that wrapped this in try/catch would swallow it.
export async function createStorefront(input: CreateStorefrontInput): Promise<{ error: string } | void> {
    const response = await apiFetch(`/storefronts/`, {
        method: "POST",
        body: JSON.stringify(input),
    });

    if (!response.ok) {
        return { error: await errorFrom(response, "Failed to create storefront.") };
    }

    const { slug, homepage } = await response.json();

    // the homepage list is server-rendered from getStorefrontList
    revalidatePath("/");
    redirect(`/${slug}/${homepage.slug}`);
}
