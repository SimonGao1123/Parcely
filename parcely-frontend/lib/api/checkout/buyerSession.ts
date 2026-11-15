import { cookies } from "next/headers";
import type { BuyerPurpose } from "@/types/checkout";

// Server-only helpers, deliberately not a 'use server' file: these are called by
// the actions and fetchers beside them, never by the client.
//
// One cookie per storefront and purpose. The backend token is per seller, but the
// frontend only ever knows the storefront, and a slug is all it can key on.
// httpOnly because the token is a bearer credential; it reaches Django as a
// header from the server, so the browser never needs to read it.
const COOKIE_PREFIX: Record<BuyerPurpose, string> = {
    checkout: "buyer_session_",
    purchases: "purchases_session_",
};

const HEADER: Record<BuyerPurpose, string> = {
    checkout: "X-Buyer-Session",
    purchases: "X-Purchases-Session",
};

function cookieName(storefrontSlug: string, purpose: BuyerPurpose) {
    return `${COOKIE_PREFIX[purpose]}${storefrontSlug}`;
}

export async function hasBuyerCookie(storefrontSlug: string, purpose: BuyerPurpose) {
    const store = await cookies();
    return store.has(cookieName(storefrontSlug, purpose));
}

export async function buyerHeaders(
    storefrontSlug: string,
    purpose: BuyerPurpose,
): Promise<Record<string, string>> {
    const store = await cookies();
    const token = store.get(cookieName(storefrontSlug, purpose))?.value;
    return token ? { [HEADER[purpose]]: token } : {};
}

// The guest cart's token, which checkout needs to find the cart it is paying for.
export async function cartHeaders(): Promise<Record<string, string>> {
    const store = await cookies();
    const token = store.get("public_session_id")?.value;
    return token ? { "X-Public-Cart-ID": token } : {};
}

// Setting and clearing only work inside a Server Action or Route Handler.
export async function setBuyerCookie(
    storefrontSlug: string,
    purpose: BuyerPurpose,
    token: string,
    maxAge: number,
) {
    const store = await cookies();
    store.set(cookieName(storefrontSlug, purpose), token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        // Matches the token's own expiry, so a cookie never outlives what it holds.
        maxAge,
        sameSite: "lax",
        path: "/",
    });
}

export async function clearBuyerCookie(storefrontSlug: string, purpose: BuyerPurpose) {
    const store = await cookies();
    store.delete(cookieName(storefrontSlug, purpose));
}
