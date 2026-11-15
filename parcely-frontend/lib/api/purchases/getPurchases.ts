import { apiFetch } from "../../api.server";
import { errorFrom } from "../formatErrors";
import { buyerHeaders } from "../checkout/buyerSession";
import type { Paginated } from "@/types/api";
import type { PurchasedSubscription, Receipt } from "@/types/purchases";

export type PurchaseKind = "subscriptions" | "orders";

export type PurchasePage = Paginated<Receipt> | Paginated<PurchasedSubscription>;

// null means "not allowed to see this" - signed out with no live purchases token -
// which the page answers with the verification gate rather than an error.
async function read(
    path: string,
    headers: Record<string, string>,
): Promise<PurchasePage | null | { error: string }> {
    const response = await apiFetch(path, { headers });
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) return { error: await errorFrom(response, "Could not load your purchases.") };
    return response.json();
}

function pageQuery(page: number) {
    return page > 1 ? `?page=${page}` : "";
}

// Signed in only: every storefront this account has bought from.
export async function getMyPurchases(kind: PurchaseKind, page: number) {
    return read(`/billing/purchases/${kind}/${pageQuery(page)}`, {});
}

// One seller's purchases. Signed in, Clerk answers; otherwise the purchases token
// from this storefront's code. Never the checkout token - the backend refuses it.
export async function getStorePurchases(
    storefrontSlug: string,
    kind: PurchaseKind,
    page: number,
) {
    return read(
        `/storefronts/${storefrontSlug}/purchases/${kind}/${pageQuery(page)}`,
        await buyerHeaders(storefrontSlug, "purchases"),
    );
}
