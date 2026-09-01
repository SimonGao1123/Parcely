'use server'

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { apiFetch } from "../../api.server";
import { errorFrom } from "../formatErrors";

// Empties the cart without deleting it, so the shopper keeps the same cart (and
// the same session token) at this storefront.
export const clearCart = async (storefrontSlug: string): Promise<{ error: string } | null> => {
    const store = await cookies();
    const token = store.get("public_session_id")?.value;

    const response = await apiFetch(`/storefronts/${storefrontSlug}/cart/clear/`, {
        method: "DELETE",
        ...(token ? { headers: { "X-Public-Cart-ID": token } } : {}),
    });

    if (!response.ok) {
        return { error: await errorFrom(response, "Failed to clear cart") };
    }

    refresh();
    return null;
}
