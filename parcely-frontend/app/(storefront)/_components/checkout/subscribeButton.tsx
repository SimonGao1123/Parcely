// No 'use client' — rendered inside ProductBlock, so it inherits that boundary.

import Link from "next/link";

// Subscriptions skip the cart: this goes straight to the plan's own checkout page,
// where the buyer confirms their email and leaves for Stripe.
export default function SubscribeButton({
    storefrontSlug,
    planId,
    soldOut,
}: {
    storefrontSlug: string;
    planId: number;
    soldOut: boolean;
}) {
    const className =
        "block w-full rounded-lg px-[0.85em] py-[0.7em] text-center text-[0.95em] font-medium";
    const style = { background: "var(--sf-fg)", color: "var(--sf-bg)" };

    if (soldOut) {
        return (
            <span aria-disabled className={`${className} cursor-not-allowed opacity-50`} style={style}>
                Sold out
            </span>
        );
    }

    return (
        <Link href={`/${storefrontSlug}/subscribe/${planId}`} className={className} style={style}>
            Subscribe
        </Link>
    );
}
