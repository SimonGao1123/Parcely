import { apiFetch } from "@/lib/api.server";
import type { Paginated } from "@/types/api";
import type { StorefrontSummary } from "@/types/storefront";
import { cache } from "react";
import type { StorefrontListQuery } from "./getStorefrontList";
// /storefronts/ is owner-scoped, so unlike /storefronts/all/ this includes the
// caller's drafts. It is paginated like every other DRF list endpoint.
export const getPersonalStorefronts = cache(
    async ({page, order, theme, title}: StorefrontListQuery = {}): Promise<Paginated<StorefrontSummary>> => {
        const params = new URLSearchParams();
        params.set("order", order || "-created");
        if (page) params.set("page", page);
        if (theme) params.set("theme", theme);
        if (title) params.set("title", title);

        const response = await apiFetch(`/storefronts/?${params.toString()}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch personal storefronts: ${response.statusText}`);
        }
        return await response.json();
})