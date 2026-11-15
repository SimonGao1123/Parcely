'use server'

import { apiFetch } from "../../api.server";
import { codeErrorFrom, type CodeError } from "./codeError";
import type { SendCodeResult } from "@/types/checkout";

// Emails a six-digit code for this storefront's seller. Sending a new one voids
// any code still outstanding for the same address.
export async function sendCode(
    storefrontSlug: string,
    email: string,
): Promise<SendCodeResult | CodeError> {
    const response = await apiFetch(`/storefronts/${storefrontSlug}/checkout/send-otp/`, {
        method: "POST",
        body: JSON.stringify({ email }),
    });

    if (!response.ok) {
        return codeErrorFrom(response, "Could not send a code. Try again.");
    }
    return response.json();
}
