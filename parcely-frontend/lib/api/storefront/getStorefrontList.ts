import { apiFetch } from "@/lib/api.server";
import { cache } from "react";
import type { Paginated } from "@/types/api";
import type { StorefrontSummary } from "@/types/storefront";

export type StorefrontListQuery = {
    page?: string;
    order?: string;
    theme?: string;
    title?: string;
};

// /storefronts/ is owner-scoped and requires auth; /storefronts/all/ is the
// public list and is the one carrying StoreFrontFilter.
export const getStorefrontList = cache(
    async ({ page, order, theme, title }: StorefrontListQuery = {}): Promise<Paginated<StorefrontSummary>> => {
        const params = new URLSearchParams();
        params.set("order", order || "-created");
        if (page) params.set("page", page);
        if (theme) params.set("theme", theme);
        if (title) params.set("title", title);

        const response = await apiFetch(`/storefronts/all/?${params.toString()}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch storefront list: ${response.statusText}`);
        }

        return response.json();
    },
);
