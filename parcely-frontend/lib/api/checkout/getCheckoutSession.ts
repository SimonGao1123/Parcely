import { apiFetch } from "../../api.server";
import { buyerHeaders } from "./buyerSession";
import type { CheckoutSessionStatus } from "@/types/checkout";

// The state of a session the buyer just came back from. null covers every way
// this browser cannot see it - no token, an expired one, or a session that is
// not theirs - since the backend deliberately answers all three the same.
export async function getCheckoutSession(
    storefrontSlug: string,
    sessionId: string,
): Promise<CheckoutSessionStatus | null> {
    const response = await apiFetch(
        `/storefronts/${storefrontSlug}/checkout/sessions/${encodeURIComponent(sessionId)}/`,
        { headers: await buyerHeaders(storefrontSlug, "checkout") },
    );
    if (!response.ok) return null;
    return response.json();
}
