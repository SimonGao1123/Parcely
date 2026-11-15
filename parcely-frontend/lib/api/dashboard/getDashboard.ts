import { apiFetch } from "../../api.server";
import { errorFrom } from "../formatErrors";
import type { Paginated } from "@/types/api";
import type { SellerCustomer, SellerReceipt, SellerSubscription } from "@/types/dashboard";

// Owner-only reads for a storefront's Orders tab. The page has already passed
// requireStorefrontOwner; the backend checks ownership again on every call.
async function read<T>(path: string, fallback: string): Promise<Paginated<T> | { error: string }> {
    const response = await apiFetch(path);
    if (!response.ok) return { error: await errorFrom(response, fallback) };
    return response.json();
}

function query(params: Record<string, string | number | undefined>) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && !(key === "page" && value === 1)) search.set(key, String(value));
    }
    const text = search.toString();
    return text ? `?${text}` : "";
}

export async function getStoreOrders(storefrontSlug: string, page: number) {
    return read<SellerReceipt>(
        `/storefronts/${storefrontSlug}/dashboard/orders/${query({ page })}`,
        "Could not load orders.",
    );
}

export async function getStoreSubscriptions(
    storefrontSlug: string,
    status: "live" | "ended" | undefined,
    page: number,
) {
    return read<SellerSubscription>(
        `/storefronts/${storefrontSlug}/dashboard/subscriptions/${query({ status, page })}`,
        "Could not load subscriptions.",
    );
}

export async function getStoreCustomers(storefrontSlug: string, page: number) {
    return read<SellerCustomer>(
        `/storefronts/${storefrontSlug}/dashboard/customers/${query({ page })}`,
        "Could not load customers.",
    );
}
