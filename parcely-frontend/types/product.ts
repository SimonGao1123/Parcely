import type { MediaBlob } from "@/types/blob";

export type BillingInterval = "day" | "week" | "month" | "year";

// billing_interval/count are required when the parent product is a subscription
// and rejected when it isn't, so the pairing is enforced server-side only.
export type Plan = {
    id: number;
    product: number;
    title: string | null;
    price_cents: number;
    billing_interval: BillingInterval | null;
    billing_interval_count: number | null;
    trial_period_days: number | null;
    created_at: string;
    updated_at: string;
};

// Mirrors ProductSummarySerializer, where storefront is a bare id.
export type Product = {
    id: number;
    storefront: number;
    name: string;
    description: string;
    is_subscription: boolean;
    is_active: boolean;
    max_capacity: number | null;
    display_image: MediaBlob | null;
    plans: Plan[];
    created_at: string;
    updated_at: string;
};

export type ProductCartSummary = Omit<Product, "plans" | "storefront"> & {
    storefront: number;
}
export type PlanCartSummary = Omit<Plan, "product"> & {
    product: ProductCartSummary;
}