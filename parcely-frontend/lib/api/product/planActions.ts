'use server';

import { refresh, revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api.server";
import { errorFrom } from "@/lib/api/formatErrors";
import type { BillingInterval } from "@/types/product";

// One file for all three: they differ only in method and URL suffix, and split
// apart they would be three near-identical eight-line modules.

// The three interval keys are omitted entirely for a one-time product rather
// than sent as null. Plan.clean() rejects them as non-null on a one-time
// product and requires interval + count on a subscription, so the pairing is
// enforced server-side and this type stays loose on purpose.
export type PlanInput = {
    title?: string | null;
    price_cents: number;
    billing_interval?: BillingInterval | null;
    billing_interval_count?: number | null;
    trial_period_days?: number | null;
};

// Plans render inside product blocks, so every write here can change a public
// page as well as the catalogue.
function revalidate(storefrontSlug: string) {
    revalidatePath(`/${storefrontSlug}`, "layout");
    refresh();
}

export async function createPlan(
    storefrontSlug: string,
    productId: number,
    input: PlanInput,
): Promise<{ error: string } | void> {
    const response = await apiFetch(
        `/storefronts/${storefrontSlug}/products/${productId}/plans/create/`,
        { method: "POST", body: JSON.stringify(input) },
    );

    if (!response.ok) {
        return { error: await errorFrom(response, "Failed to create plan.") };
    }

    revalidate(storefrontSlug);
}

export async function updatePlan(
    storefrontSlug: string,
    productId: number,
    planId: number,
    input: PlanInput,
): Promise<{ error: string } | void> {
    const response = await apiFetch(
        `/storefronts/${storefrontSlug}/products/${productId}/plans/${planId}/update/`,
        { method: "PATCH", body: JSON.stringify(input) },
    );

    if (!response.ok) {
        return { error: await errorFrom(response, "Failed to save plan.") };
    }

    revalidate(storefrontSlug);
}

export async function deletePlan(
    storefrontSlug: string,
    productId: number,
    planId: number,
): Promise<{ error: string } | void> {
    const response = await apiFetch(
        `/storefronts/${storefrontSlug}/products/${productId}/plans/${planId}/delete/`,
        { method: "DELETE" },
    );

    if (!response.ok) {
        return { error: await errorFrom(response, "Failed to delete plan.") };
    }

    revalidate(storefrontSlug);
}
