import Link from "next/link";
import { notFound } from "next/navigation";
import PendingRefresher from "@/app/(storefront)/_components/checkout/pendingRefresher";
import { orderPages } from "@/app/(storefront)/_components/storefront/orderPages";
import { getCheckoutSession } from "@/lib/api/checkout/getCheckoutSession";
import { getStorefrontDetails } from "@/lib/api/storefront/getStorefrontDetails";
import { formatPrice } from "@/lib/price";

// Stripe's success_url. The session id in the query is not trusted on its own:
// the backend only describes a session that belongs to this browser's verified
// buyer, and every other case gets the same generic message, so an id that leaked
// or was guessed reveals nothing.
export default async function CheckoutSuccessPage({
    params,
    searchParams,
}: {
    params: Promise<{ storefrontSlug: string }>;
    searchParams: Promise<{ session_id?: string | string[] }>;
}) {
    const [{ storefrontSlug }, query] = await Promise.all([params, searchParams]);
    const sessionId = Array.isArray(query.session_id) ? query.session_id[0] : query.session_id;
    if (!sessionId) notFound();

    const [storefront, session] = await Promise.all([
        getStorefrontDetails(storefrontSlug),
        getCheckoutSession(storefrontSlug, sessionId),
    ]);
    const landing = orderPages(storefront)[0];

    const links = (
        <div className="flex flex-wrap gap-4 text-sm">
            <Link href={`/${storefrontSlug}/purchases`} className="underline">
                View purchases
            </Link>
            {landing && (
                <Link href={`/${storefrontSlug}/${landing.slug}`} className="underline opacity-70">
                    Continue shopping
                </Link>
            )}
        </div>
    );

    if (!session) {
        return (
            <Shell title="Thank you">
                <p className="opacity-70">
                    If your payment went through, your purchase is being processed and will appear in
                    Purchases shortly.
                </p>
                {links}
            </Shell>
        );
    }

    if (session.status !== "complete") {
        // Expired or abandoned - Stripe only sends buyers here once they finish,
        // so this is a stale or hand-edited link.
        return (
            <Shell title="Checkout not completed">
                <p className="opacity-70">This checkout wasn&apos;t finished, so you haven&apos;t been charged.</p>
                {links}
            </Shell>
        );
    }

    if (session.payment_status === "unpaid") {
        // A delayed method (a bank debit, say). It completes later on its own.
        return (
            <Shell title="Payment processing">
                <p className="opacity-70">
                    Your payment is still being processed by your bank. It will appear in Purchases
                    once it clears.
                </p>
                {links}
            </Shell>
        );
    }

    const total =
        session.amount_total !== null ? formatPrice(session.amount_total, session.currency) : null;
    const isSubscription = session.mode === "subscription";

    return (
        <Shell title={isSubscription ? "You're subscribed" : "Thank you for your order"}>
            {total && (
                <p className="text-lg">
                    {isSubscription && session.payment_status === "no_payment_required"
                        ? "Your free trial has started — nothing was charged today."
                        : `You paid ${total}.`}
                </p>
            )}
            {session.fulfilled ? (
                <p className="opacity-70">It&apos;s been added to your Purchases.</p>
            ) : (
                <PendingRefresher />
            )}
            {links}
        </Shell>
    );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-6 py-12 font-[family-name:var(--sf-font)]">
            <h1 className="text-3xl font-semibold">{title}</h1>
            {children}
        </main>
    );
}
