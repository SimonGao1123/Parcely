import { notFound } from "next/navigation";
import { cache } from "react";
import { apiFetch } from "@/lib/api.server";
import type { PageSummary } from "@/types/page";

// "product" for pages created by a product, "normal" for hand-made ones, omitted
// for both.
export type PageType = "product" | "normal";

// The storefront detail response already carries the normal pages, so this
// exists for the two things it can't answer: the products tab, which wants the
// product pages it deliberately leaves out, and the link block's page picker,
// which wants everything.
//
// Unpaginated, owner-scoped and notFound()-on-error for the same reasons as
// getProducts.
export const getPages = cache(
    async (storefrontSlug: string, type?: PageType): Promise<PageSummary[]> => {
        const query = type ? `?type=${type}` : "";
        const response = await apiFetch(`/storefronts/${storefrontSlug}/pages/${query}`);
        if (!response.ok) {
            notFound();
        }
        return response.json();
    },
);
