import { formatPrice, planIntervalPhrase } from "@/lib/price";
import type { PurchasedSubscription } from "@/types/purchases";

// Pinned for the same reason lib/price.ts pins its locale. These render on the
// server only, so there is no hydration to disagree with, but one format everywhere.
const DATE = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export function formatDate(iso: string): string {
    return DATE.format(new Date(iso));
}

const BRANDS: Record<string, string> = {
    amex: "Amex",
    diners: "Diners Club",
    discover: "Discover",
    jcb: "JCB",
    mastercard: "Mastercard",
    unionpay: "UnionPay",
    visa: "Visa",
};

// "Visa •••• 4242", or null when the payment carried no card - a $0 trial, or a
// lookup that failed when the payment was recorded.
export function cardLabel(brand: string | null, last4: string | null): string | null {
    if (!last4) return null;
    const name = brand ? (BRANDS[brand] ?? brand[0].toUpperCase() + brand.slice(1)) : "Card";
    return `${name} •••• ${last4}`;
}

export function subscriptionPrice(sub: PurchasedSubscription): string {
    const price = formatPrice(sub.unit_price_cents, sub.currency);
    const phrase = planIntervalPhrase({ ...sub.plan, price_cents: sub.unit_price_cents });
    return phrase ? `${price} ${phrase}` : price;
}

// The one date that matters for where this subscription stands right now.
export function subscriptionTimeline(sub: PurchasedSubscription): string | null {
    switch (sub.status) {
        case "canceled":
        case "incomplete_expired":
            return sub.ended_at ? `Ended ${formatDate(sub.ended_at)}` : "Ended";
        case "past_due":
        case "unpaid":
            return "Payment overdue — update your card to keep it";
        case "trialing":
            if (!sub.trial_end) return "Free trial";
            return sub.cancel_at_period_end
                ? `Trial ends ${formatDate(sub.trial_end)}, then it ends`
                : `Trial ends ${formatDate(sub.trial_end)}`;
        default:
            if (!sub.current_period_end) return null;
            return sub.cancel_at_period_end
                ? `Ends ${formatDate(sub.current_period_end)}`
                : `Renews ${formatDate(sub.current_period_end)}`;
    }
}

const STATUS: Record<PurchasedSubscription["status"], { label: string; tone: "good" | "warn" | "muted" }> = {
    active: { label: "Active", tone: "good" },
    trialing: { label: "Trial", tone: "good" },
    past_due: { label: "Past due", tone: "warn" },
    unpaid: { label: "Unpaid", tone: "warn" },
    incomplete: { label: "Incomplete", tone: "warn" },
    paused: { label: "Paused", tone: "muted" },
    canceled: { label: "Ended", tone: "muted" },
    incomplete_expired: { label: "Expired", tone: "muted" },
};

export function subscriptionStatus(sub: PurchasedSubscription) {
    return STATUS[sub.status];
}
