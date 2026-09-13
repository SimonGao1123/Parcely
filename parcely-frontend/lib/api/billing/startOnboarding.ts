'use server';

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api.server";
import { errorFrom } from "@/lib/api/formatErrors";

// Only ever call this from an explicit user action. The endpoint creates the
// seller's Stripe connected account when they don't have one yet, so calling it
// during render would provision an account for anyone who loads the page.
//
// Errors come back as data rather than thrown: redirect() signals itself by
// throwing, so a caller that wrapped this in try/catch would swallow it.
export async function startOnboarding(): Promise<{ error: string } | void> {
    const response = await apiFetch(`/billing/onboarding/`, { method: "POST" });

    if (!response.ok) {
        return { error: await errorFrom(response, "Could not start Stripe onboarding.") };
    }

    const { url } = await response.json();

    // Null url means the seller is already active and there is nothing to do -
    // re-render so the page reflects whatever status came back.
    if (!url) {
        revalidatePath("/profile");
        return;
    }

    // Stripe hosts the onboarding flow, so this leaves the app entirely.
    redirect(url);
}
