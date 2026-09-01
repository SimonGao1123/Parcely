import { cache } from "react";
import { cookies } from "next/headers";
import { apiFetch } from "../../api.server";
import { errorFrom } from "../formatErrors";
import type { Cart } from "@/types/cart";

// Not a Server Action: only Server Components read the cart, and cache() dedupes
// the storefront layout's call with the cart page's own within one render.
//
// null means the shopper has no cart here yet — the endpoint answers 204 with no
// body rather than an empty cart, so a page view never leaves a cart row behind.
export const getCart = cache(
    async (storefrontSlug: string): Promise<Cart | null | { error: string }> => {
        const store = await cookies();
        const token = store.get("public_session_id")?.value;

        const response = await apiFetch(`/storefronts/${storefrontSlug}/cart/details/`, {
            method: "GET",
            ...(token ? { headers: { "X-Public-Cart-ID": token } } : {}),
        });

        if (response.status === 204) return null;

        if (!response.ok) {
            return { error: await errorFrom(response, "Failed to load cart") };
        }

        return response.json();
    },
);
