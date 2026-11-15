'use server'

import { refresh } from "next/cache";
import { apiFetch } from "../../api.server";
import { errorFrom } from "../formatErrors";

// Cancels the customer's live subscriptions at Stripe and blocks them from
// checking out again, across every storefront the seller owns. History stays.
// Safe to repeat: a partial failure leaves the block in place, and a retry only
// touches subscriptions still live.
export async function removeCustomer(
    storefrontSlug: string,
    customerId: number,
): Promise<{ error: string } | null> {
    const response = await apiFetch(
        `/storefronts/${storefrontSlug}/dashboard/customers/${customerId}/remove/`,
        { method: "POST" },
    );
    // Refreshed either way: even a failure may have blocked them and cancelled some.
    refresh();
    if (!response.ok) return { error: await errorFrom(response, "Could not remove this customer.") };
    return null;
}

// Lets them buy again. Resubscribes no one.
export async function unblockCustomer(
    storefrontSlug: string,
    customerId: number,
): Promise<{ error: string } | null> {
    const response = await apiFetch(
        `/storefronts/${storefrontSlug}/dashboard/customers/${customerId}/unblock/`,
        { method: "POST" },
    );
    if (!response.ok) return { error: await errorFrom(response, "Could not unblock this customer.") };
    refresh();
    return null;
}
