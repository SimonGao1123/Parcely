'use client';

import { useState } from "react";
import Button from "@/components/button";
import { startOnboarding } from "@/lib/api/billing/startOnboarding";
import type { CardPaymentsStatus } from "@/types/user";

type Props = {
    status: CardPaymentsStatus | null;
    canSell: boolean;
};

// Only "active" lets a seller trade; the other states differ in who has to act,
// which is the whole reason this section exists rather than a boolean.
const COPY: Record<"none" | CardPaymentsStatus, { heading: string; body: string }> = {
    none: {
        heading: "Payments not set up",
        body: "Connect a Stripe account to accept payments. You'll need this before you can create a storefront.",
    },
    pending: {
        heading: "Stripe is reviewing your details",
        body: "Nothing is needed from you right now. This page will show the result once Stripe finishes.",
    },
    restricted: {
        heading: "Stripe needs more information",
        body: "Your account exists but can't take payments yet. Continue setup to supply what's missing.",
    },
    unsupported: {
        heading: "This account can't accept payments",
        body: "Stripe won't enable card payments for this account. Contact support to sort out why.",
    },
    active: {
        heading: "Accepting payments",
        body: "Your Stripe account is active, so you can create storefronts and take payments.",
    },
};

export default function StripeOnboarding({ status, canSell }: Props) {
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { heading, body } = COPY[status ?? "none"];

    // Nothing to offer when they're done, and "unsupported" is rejected by the
    // backend outright - a button there would only ever produce an error.
    const showButton = !canSell && status !== "unsupported";

    const handleClick = async () => {
        setError(null);
        setSubmitting(true);
        // Leaves for Stripe on success, so reaching the next line means it didn't.
        const result = await startOnboarding();
        if (result?.error) setError(result.error);
        setSubmitting(false);
    };

    return (
        <section className="flex flex-col gap-3 rounded-lg border border-stone-300 bg-white px-5 py-4">
            <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-medium text-stone-800">{heading}</h2>
                <span
                    className={`rounded-full border px-3 py-1 text-xs ${
                        canSell
                            ? "border-green-300 bg-green-50 text-green-800"
                            : "border-amber-300 bg-amber-50 text-amber-800"
                    }`}
                >
                    {status ?? "not started"}
                </span>
            </div>

            <p className="text-sm text-stone-600">{body}</p>

            {error && (
                <p className="whitespace-pre-line rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                </p>
            )}

            {showButton && (
                <Button onClick={handleClick} disabled={submitting} className="self-start">
                    {submitting
                        ? "Opening Stripe…"
                        : status === null
                          ? "Set up payments"
                          : "Continue setup"}
                </Button>
            )}
        </section>
    );
}
