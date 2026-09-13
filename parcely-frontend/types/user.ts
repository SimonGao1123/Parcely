// Mirrors AppUserSerializer — clerk_id and username are deliberately not exposed.
export type User = {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    profile_picture: string | null;
    created_at: string;
    updated_at: string;
};

// Mirrors Stripe's card_payments capability status verbatim. Only "active" means
// the seller can take payment; the other three are all "not yet", differing in
// why and in who has to act.
export type CardPaymentsStatus = "active" | "pending" | "restricted" | "unsupported";

// Mirrors MeSerializer — the signed-in user's own record. Stripe state lives here
// rather than on User because User is nested publicly as a storefront's owner.
// can_sell mirrors the model property: gate on it rather than re-deriving it from
// card_payments_status.
export type Me = User & {
    card_payments_status: CardPaymentsStatus | null; // null until a connected account exists
    can_sell: boolean;
};

// Mirrors PublicOwnerSerializer — a storefront owner as seen by anyone, including
// anonymous visitors. No email: public storefront endpoints are harvestable.
export type PublicOwner = {
    id: number;
    first_name: string;
    profile_picture: string | null;
};
