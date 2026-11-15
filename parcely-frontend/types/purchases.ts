import type { BillingInterval } from "@/types/product";
import type { Currency } from "@/types/storefront";

export type StorefrontRef = { title: string; slug: string };

// Mirrors OrderLineSerializer - one billed line of a receipt.
export type OrderLine = {
    id: number;
    plan_name_snapshot: string;
    quantity: number;
    unit_price_cents: number;
};

// Mirrors PaymentSerializer - one movement of money. There is no status: a
// Payment row only exists once money has moved.
export type Receipt = {
    id: number;
    created_at: string;
    amount_cents: number;
    currency: Currency;
    card_brand: string | null;
    card_last4: string | null;
    kind: "one_time" | "subscription";
    storefront: StorefrontRef | null;
    orders: OrderLine[];
};

// Mirrors Stripe's subscription statuses verbatim.
export type SubscriptionStatus =
    | "active"
    | "trialing"
    | "past_due"
    | "unpaid"
    | "canceled"
    | "incomplete"
    | "incomplete_expired"
    | "paused";

// Mirrors SubscriptionSerializer. plan carries only what lib/price.ts formats.
export type PurchasedSubscription = {
    id: number;
    status: SubscriptionStatus;
    product_name: string;
    plan: {
        id: number;
        title: string | null;
        billing_interval: BillingInterval | null;
        billing_interval_count: number | null;
        trial_period_days: number | null;
    };
    unit_price_cents: number;
    currency: Currency;
    current_period_end: string | null;
    trial_end: string | null;
    cancel_at_period_end: boolean;
    ended_at: string | null;
    created_at: string;
    storefront: StorefrontRef;
    card_brand: string | null;
    card_last4: string | null;
};
