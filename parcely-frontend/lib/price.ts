import type { BillingInterval, Plan } from "@/types/product";
import type { Currency } from "@/types/storefront";

// The locale is pinned rather than left to the runtime default. Product blocks
// render on the server and hydrate on the client, and those two would disagree
// whenever the browser's locale differs from the server's — a currency string
// formatted two ways is a hydration mismatch. There is no i18n anywhere in the
// app, so pinning costs nothing.
const LOCALE = "en-US";

// The three plan helpers below read only pricing fields, so they take a Plan
// without its product: cart items carry a PlanCartSummary, whose product is the
// object rather than an id and so is not assignable to Plan.
type PlanPricing = Omit<Plan, "product">;

const INTERVAL_SHORT: Record<BillingInterval, string> = {
    day: "day",
    week: "wk",
    month: "mo",
    year: "yr",
};

const INTERVAL_NAME: Record<BillingInterval, string> = {
    day: "Daily",
    week: "Weekly",
    month: "Monthly",
    year: "Yearly",
};

export function formatPrice(cents: number, currency: Currency): string {
    return new Intl.NumberFormat(LOCALE, {
        style: "currency",
        currency: currency.toUpperCase(),
    }).format(cents / 100);
}

// Compact interval for the selected-plan headline and the right side of a plan
// row: "mo", "12 mo". Null on a one-time plan, which has no interval to show.
export function planIntervalSuffix(plan: PlanPricing): string | null {
    if (!plan.billing_interval) return null;
    const count = plan.billing_interval_count ?? 1;
    const short = INTERVAL_SHORT[plan.billing_interval];
    return count === 1 ? short : `${count} ${short}`;
}

// Spelled out rather than compact: "mo" is too terse to sit under the cart's
// RECURRING PAYMENT label. Null on a one-time plan, which is not billed again.
export function planIntervalPhrase(plan: PlanPricing): string | null {
    if (!plan.billing_interval) return null;
    const count = plan.billing_interval_count ?? 1;
    return count === 1
        ? `every ${plan.billing_interval}`
        : `every ${count} ${plan.billing_interval}s`;
}

// Left side of a plan row. title wins when set; otherwise the interval is
// spelled out ("Monthly", "12 months") so the price can sit on the other side.
export function planName(plan: PlanPricing): string {
    if (plan.title) return plan.title;
    if (!plan.billing_interval) return "One-time";
    const count = plan.billing_interval_count ?? 1;
    if (count === 1) return INTERVAL_NAME[plan.billing_interval];
    return `${count} ${plan.billing_interval}s`;
}

// The label a plan wears on a button. title is free text and wins outright when
// set; otherwise the price carries the interval, which is null on a one-time
// product and required on a subscription.
export function planLabel(plan: PlanPricing, currency: Currency): string {
    if (plan.title) return plan.title;

    const price = formatPrice(plan.price_cents, currency);
    if (!plan.billing_interval) return price;

    const count = plan.billing_interval_count ?? 1;
    return count === 1
        ? `${price} / ${plan.billing_interval}`
        : `${price} every ${count} ${plan.billing_interval}s`;
}
