'use server';

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api.server";
import type { StorefrontStyle, Theme } from "@/types/storefront";

export type CreateStorefrontInput = {
    title: string;
    description: string | null;
    theme: Theme;
    style: StorefrontStyle;
    logo_image_id: number | null;
    banner_image_id: number | null;
};

// DRF hands back either {"detail": "..."} or {"field": ["msg", ...]}
function formatErrors(body: unknown): string {
    if (typeof body !== "object" || body === null) return "Failed to create storefront.";
    const entries = Object.entries(body as Record<string, unknown>);
    if (entries.length === 0) return "Failed to create storefront.";

    return entries
        .map(([field, messages]) => {
            const text = Array.isArray(messages) ? messages.join(" ") : String(messages);
            return field === "detail" ? text : `${field}: ${text}`;
        })
        .join("\n");
}

// Errors come back as data rather than thrown: redirect() signals itself by
// throwing, so a caller that wrapped this in try/catch would swallow it.
export async function createStorefront(input: CreateStorefrontInput): Promise<{ error: string } | void> {
    const response = await apiFetch(`/storefronts/`, {
        method: "POST",
        body: JSON.stringify(input),
    });

    if (!response.ok) {
        return { error: formatErrors(await response.json().catch(() => null)) };
    }

    const { slug } = await response.json();

    // the homepage list is server-rendered from getStorefrontList
    revalidatePath("/");
    redirect(`/${slug}`);
}
