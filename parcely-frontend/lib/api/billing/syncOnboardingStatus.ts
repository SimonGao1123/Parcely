import { apiFetch } from "@/lib/api.server";
import type { CardPaymentsStatus } from "@/types/user";

type SyncResult = {
    stripe_account_id: string | null;
    card_payments_status: CardPaymentsStatus | null;
};

// Pulls the seller's capability status from Stripe and writes it locally. Safe to
// call on a page the seller landed on, unlike startOnboarding - this one never
// creates an account, it only reads one that already exists.
export async function syncOnboardingStatus(): Promise<SyncResult | null> {
    const response = await apiFetch("/billing/onboarding/sync/", { method: "POST" });
    if (!response.ok) {
        return null;
    }
    return response.json();
}
