import { notFound } from "next/navigation";
import { cache } from "react";
import { apiFetch } from "@/lib/api.server";
import type { Product } from "@/types/product";

// A bare array rather than Paginated<Product>: ProductListCreateAPIView sets
// pagination_class = None, because both callers — the catalogue and the
// editor's product picker — need the whole set.
//
// notFound() rather than a thrown Error, matching getStorefrontDetails. The
// endpoint is owner-scoped, so a non-ok response means the caller may not see
// this storefront, which is a 404 here by the same rule that hides drafts. It
// also has to lose to nothing: both callers run this in a Promise.all beside
// requireStorefrontOwner, and a plain Error would win that race and turn a
// signed-out visit into a 500.
export const getProducts = cache(async (storefrontSlug: string): Promise<Product[]> => {
    const response = await apiFetch(`/storefronts/${storefrontSlug}/products/`);
    if (!response.ok) {
        notFound();
    }
    return response.json();
});
