import type { PurchasedSubscription, Receipt } from "@/types/purchases";

export type CustomerRef = { id: number; email: string };

export type SellerReceipt = Receipt & { customer: CustomerRef };
export type SellerSubscription = PurchasedSubscription & { customer: CustomerRef };

// Mirrors SellerCustomerSerializer. The counts are for this storefront, except
// seller_live_subscription_count, which spans every store the seller owns -
// that is how many a removal cancels.
export type SellerCustomer = {
    id: number;
    email: string;
    created_at: string;
    blocked_at: string | null;
    payment_count: number;
    total_spent_cents: number;
    live_subscription_count: number;
    seller_live_subscription_count: number;
};
