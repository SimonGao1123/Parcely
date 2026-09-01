import { StorefrontSummary } from "./storefront";
import { PlanCartSummary } from "./product";
import { User } from "./user";
export type CartItem = {
    id: number;
    plan: PlanCartSummary;
    quantity: number;
    created_at: string;
    updated_at: string;
    cart: number;
}

export type Cart = {
    id: number;
    storefront: StorefrontSummary;
    user: User;
    total_cents: number;
    items: CartItem[];
    created_at: string;
    updated_at: string;
    public_session_id: string | null;
}