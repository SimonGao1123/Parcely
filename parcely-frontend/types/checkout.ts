import type { Cart } from "@/types/cart";
import type { Product } from "@/types/product";
import type { Currency } from "@/types/storefront";

// Which token a verified code is exchanged for. A checkout token cannot read
// purchase history and a purchases token cannot check out - the backend signs
// them under different salts.
export type BuyerPurpose = "checkout" | "purchases";

// Mirrors SendOTPEmailAPIView's 200.
export type SendCodeResult = { expires_at: string };

// Mirrors VerifyEmailAPIView's 200. cart is only ever set for checkout.
export type VerifyCodeResult = {
    buyer_session: string;
    expires_in: number;
    cart: Cart | null;
};

// Mirrors CheckoutBuyerAPIView - who this browser has verified as here.
export type CheckoutBuyer = { email: string; blocked: boolean };

// Mirrors CheckoutPlanAPIView - one subscription plan for the subscribe page.
export type CheckoutPlan = { plan_id: number; product: Product };

// Mirrors CheckoutSessionStatusAPIView. fulfilled stays false until the webhook
// has written the Payment or Subscription, which usually lands after the buyer does.
export type CheckoutSessionStatus = {
    mode: "payment" | "subscription";
    status: "open" | "complete" | "expired";
    payment_status: "paid" | "unpaid" | "no_payment_required";
    amount_total: number | null;
    currency: Currency;
    fulfilled: boolean;
};
