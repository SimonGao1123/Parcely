'use server'

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { apiFetch } from "../../api.server";
import { errorFrom } from "../formatErrors";

// A quantity of 0 removes the item and comes back 204, so success is read off
// response.ok rather than a specific status.
//
// Errors come back as data rather than thrown: Next redacts anything thrown
// inside a Server Action before it reaches the browser.
export const updateCartItem = async (
    storefrontSlug: string,
    cartItemId: number,
    quantity: number,
): Promise<{ error: string } | null> => {
    const store = await cookies();
    const token = store.get("public_session_id")?.value;

    const response = await apiFetch(
        `/storefronts/${storefrontSlug}/cart/items/${cartItemId}/update/`,
        {
            method: "PATCH",
            body: JSON.stringify({ quantity }),
            ...(token ? { headers: { "X-Public-Cart-ID": token } } : {}),
        },
    );

    if (!response.ok) {
        return { error: await errorFrom(response, "Failed to update cart item") };
    }

    // Re-renders the page and its layouts, so the line total and the navbar
    // badge both follow without the caller tracking cart state of its own.
    refresh();
    return null;
}
