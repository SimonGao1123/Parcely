'use server'

import { refresh } from "next/cache";
import { clearBuyerCookie } from "./buyerSession";
import type { BuyerPurpose } from "@/types/checkout";

// "Not you?" - drops the verified email here so the next step asks for one again.
// Nothing server-side to revoke: the token is stateless and simply stops being sent.
export async function forgetBuyer(storefrontSlug: string, purpose: BuyerPurpose) {
    await clearBuyerCookie(storefrontSlug, purpose);
    refresh();
}
