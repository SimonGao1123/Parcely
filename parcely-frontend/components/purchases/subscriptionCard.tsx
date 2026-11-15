import Link from "next/link";
import { planName } from "@/lib/price";
import type { PurchasedSubscription } from "@/types/purchases";
import { cardLabel, subscriptionPrice, subscriptionStatus, subscriptionTimeline } from "./format";
import StatusBadge from "./statusBadge";

// One subscription, as the buyer or the seller sees it. `showStorefront` is for
// lists that span stores; `aside` is the seller's slot for who the buyer is.
export default function SubscriptionCard({
    subscription,
    showStorefront = false,
    aside,
}: {
    subscription: PurchasedSubscription;
    showStorefront?: boolean;
    aside?: React.ReactNode;
}) {
    const status = subscriptionStatus(subscription);
    const timeline = subscriptionTimeline(subscription);
    const card = cardLabel(subscription.card_brand, subscription.card_last4);

    return (
        <li className="flex flex-col gap-2 rounded-lg border border-current/15 px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{subscription.product_name}</span>
                    <span className="text-sm opacity-70">
                        {planName({ ...subscription.plan, price_cents: subscription.unit_price_cents })}
                        {" · "}
                        {subscriptionPrice(subscription)}
                    </span>
                </div>
                <StatusBadge {...status} />
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm opacity-70">
                {showStorefront && (
                    <Link href={`/${subscription.storefront.slug}/purchases`} className="underline">
                        {subscription.storefront.title}
                    </Link>
                )}
                {timeline && <span>{timeline}</span>}
                {card && <span>{card}</span>}
            </div>

            {aside}
        </li>
    );
}
