'use server'

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { apiFetch } from "../../api.server";
import { cartHeaders, setBuyerCookie } from "./buyerSession";
import { codeErrorFrom, type CodeError } from "./codeError";
import type { BuyerPurpose, VerifyCodeResult } from "@/types/checkout";

// Trades a code for a token of the given purpose and keeps it in an httpOnly
// cookie. Returns nothing on success: the page re-renders with the cookie set and
// reads the verified buyer from the backend itself.
export async function verifyCode(
    storefrontSlug: string,
    email: string,
    code: string,
    purpose: BuyerPurpose,
): Promise<CodeError | null> {
    const response = await apiFetch(`/storefronts/${storefrontSlug}/checkout/verify-email/`, {
        method: "POST",
        body: JSON.stringify({ email, code, purpose }),
        // The guest cart rides along so verifying can hand back the cart it found.
        headers: await cartHeaders(),
    });

    if (!response.ok) {
        return codeErrorFrom(response, "Could not verify that code.");
    }

    const result: VerifyCodeResult = await response.json();
    await setBuyerCookie(storefrontSlug, purpose, result.buyer_session, result.expires_in);

    // Same rule as createCartItem: only a cart the server just minted a token for
    // carries one, and a claimed cart comes back with null.
    if (result.cart?.public_session_id) {
        const store = await cookies();
        store.set("public_session_id", result.cart.public_session_id, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            maxAge: 60 * 60 * 24 * 30,
            sameSite: "lax",
            path: "/",
        });
    }

    refresh();
    return null;
}
