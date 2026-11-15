import { cache } from "react";
import { notFound } from "next/navigation";
import { apiFetch } from "../../api.server";
import type { CheckoutPlan } from "@/types/checkout";

// Public: the plan as the subscribe page shows it. A draft store, a retired
// product or a one-time plan all come back 404, which is what the page renders.
export const getCheckoutPlan = cache(
    async (storefrontSlug: string, planId: string): Promise<CheckoutPlan> => {
        const response = await apiFetch(
            `/storefronts/${storefrontSlug}/checkout/plans/${encodeURIComponent(planId)}/`,
        );
        if (!response.ok) notFound();
        return response.json();
    },
);
