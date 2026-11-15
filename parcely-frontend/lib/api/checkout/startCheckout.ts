'use server'

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { apiFetch } from "../../api.server";
import { errorFrom } from "../formatErrors";
import { buyerHeaders, cartHeaders, clearBuyerCookie } from "./buyerSession";

export type CheckoutError = {
    error: string;
    // The token lapsed between the page loading and the click, so the page has to
    // ask for a code again rather than show this as a failure.
    needsVerification?: boolean;
};

async function start(storefrontSlug: string, path: string, body?: object): Promise<CheckoutError> {
    const response = await apiFetch(`/storefronts/${storefrontSlug}/checkout/${path}/`, {
        method: "POST",
        ...(body ? { body: JSON.stringify(body) } : {}),
        headers: {
            ...(await buyerHeaders(storefrontSlug, "checkout")),
            ...(await cartHeaders()),
        },
    });

    if (response.status === 401) {
        await clearBuyerCookie(storefrontSlug, "checkout");
        refresh();
        return { error: "Your verification expired. Confirm your email again.", needsVerification: true };
    }

    if (!response.ok) {
        return { error: await errorFrom(response, "Could not start checkout. Try again.") };
    }

    const { url } = await response.json();
    // Outside any try: redirect() works by throwing. Stripe hosts the payment page.
    redirect(url);
}

// The cart, always one-time. Subscriptions never reach this - the cart refuses them.
export async function startCartCheckout(storefrontSlug: string): Promise<CheckoutError> {
    return start(storefrontSlug, "session");
}

// One subscription plan, bought directly. Retrying while a session is still open
// resumes that same session rather than starting a second.
export async function startSubscriptionCheckout(
    storefrontSlug: string,
    planId: number,
): Promise<CheckoutError> {
    return start(storefrontSlug, "subscription", { plan_id: planId });
}
