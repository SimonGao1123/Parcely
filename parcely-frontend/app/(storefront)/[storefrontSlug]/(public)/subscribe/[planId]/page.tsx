import CheckoutPanel from "@/app/(storefront)/_components/checkout/checkoutPanel";
import SpotsLeft from "@/app/(storefront)/_components/checkout/spotsLeft";
import { getMe } from "@/lib/api/auth/getMe";
import { getBuyer } from "@/lib/api/checkout/getBuyer";
import { getCheckoutPlan } from "@/lib/api/checkout/getCheckoutPlan";
import { getStorefrontDetails } from "@/lib/api/storefront/getStorefrontDetails";
import { formatPrice, planIntervalPhrase, planName } from "@/lib/price";

// The buy-now page for one subscription plan - the subscription's equivalent of
// the cart, holding exactly one item. Also Stripe's cancel_url for subscription
// checkouts, so backing out of Stripe lands here, and Continue resumes the same
// still-open session.
export default async function SubscribePage({
    params,
}: {
    params: Promise<{ storefrontSlug: string; planId: string }>;
}) {
    const { storefrontSlug, planId } = await params;

    // independent requests — awaiting them in sequence would waterfall
    const [storefront, { product, plan_id }, buyer, me] = await Promise.all([
        getStorefrontDetails(storefrontSlug),
        getCheckoutPlan(storefrontSlug, planId),
        getBuyer(storefrontSlug),
        getMe(),
    ]);

    const plan = product.plans.find((entry) => entry.id === plan_id)!;
    const interval = planIntervalPhrase(plan);

    return (
        <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-6 py-12 font-[family-name:var(--sf-font)]">
            <h1 className="text-3xl font-semibold">Subscribe</h1>

            <section className="flex flex-col gap-2 rounded-lg border border-current/15 px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 flex-col">
                        <span className="text-lg font-medium">{product.name}</span>
                        <span className="text-sm opacity-70">{planName(plan)}</span>
                    </div>
                    <span className="shrink-0 text-right">
                        <span className="text-xl font-semibold">
                            {formatPrice(plan.price_cents, storefront.currency)}
                        </span>
                        {interval && <span className="block text-sm opacity-70">{interval}</span>}
                    </span>
                </div>

                {plan.trial_period_days ? (
                    <p className="text-sm">
                        Starts with a {plan.trial_period_days}-day free trial — you won&apos;t be
                        charged until it ends.
                    </p>
                ) : null}

                <SpotsLeft
                    spotsLeft={product.spots_left}
                    maxCapacity={product.max_capacity}
                    className="text-sm"
                />
            </section>

            <CheckoutPanel
                storefrontSlug={storefrontSlug}
                target={{ kind: "subscription", planId: plan.id }}
                buyer={buyer}
                signedInEmail={me?.email ?? null}
                unavailable={product.spots_left === 0 ? "This subscription is full right now." : null}
            />
        </main>
    );
}
