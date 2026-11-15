import { cache } from "react";
import { apiFetch } from "../../api.server";
import { buyerHeaders, hasBuyerCookie } from "./buyerSession";
import type { CheckoutBuyer } from "@/types/checkout";

// Who this browser is verified as at this storefront, or null. The token is
// signed by Django and expires there, so only Django can say whether it is live.
export const getBuyer = cache(async (storefrontSlug: string): Promise<CheckoutBuyer | null> => {
    // No cookie, nothing to ask about - spares the round trip on every cart view.
    if (!(await hasBuyerCookie(storefrontSlug, "checkout"))) return null;

    const response = await apiFetch(`/storefronts/${storefrontSlug}/checkout/buyer/`, {
        headers: await buyerHeaders(storefrontSlug, "checkout"),
    });
    if (!response.ok) return null;
    return response.json();
});
