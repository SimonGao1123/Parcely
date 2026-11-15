'use client';

import { useState, useTransition } from "react";
import Button from "@/components/button";
import { forgetBuyer } from "@/lib/api/checkout/forgetBuyer";
import { startCartCheckout, startSubscriptionCheckout } from "@/lib/api/checkout/startCheckout";
import type { CheckoutBuyer } from "@/types/checkout";
import EmailVerification from "./emailVerification";
import { PRIMARY_CLASS, PRIMARY_STYLE } from "./themedStyles";

export type CheckoutTarget = { kind: "cart" } | { kind: "subscription"; planId: number };

// The last step before Stripe, for both flows: confirm who is paying, then leave.
// Payment details are only ever entered on Stripe's own page.
export default function CheckoutPanel({
    storefrontSlug,
    target,
    buyer,
    signedInEmail,
    unavailable,
}: {
    storefrontSlug: string;
    target: CheckoutTarget;
    buyer: CheckoutBuyer | null;
    // Signed in, checkout must use the account's own address - the backend refuses
    // any other - so it is filled in and locked.
    signedInEmail: string | null;
    // Why checkout cannot start at all (sold out), shown in place of the button.
    unavailable?: string | null;
}) {
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    // A token left over from a guest checkout under another address does not
    // count once someone is signed in: they verify as themselves.
    const verified =
        buyer !== null && (signedInEmail === null || buyer.email === signedInEmail.toLowerCase());

    const proceed = () =>
        startTransition(async () => {
            setError(null);
            // Navigates to Stripe on success, so returning at all means it didn't.
            const result =
                target.kind === "cart"
                    ? await startCartCheckout(storefrontSlug)
                    : await startSubscriptionCheckout(storefrontSlug, target.planId);
            setError(result.error);
        });

    if (!verified) {
        return (
            <section className="flex flex-col gap-3 rounded-lg border border-current/15 px-4 py-4">
                <div className="flex flex-col gap-0.5">
                    <h2 className="font-medium">Confirm your email</h2>
                    <p className="text-sm opacity-70">
                        We&apos;ll send a code to confirm it&apos;s you. Your receipt goes to this address.
                    </p>
                </div>
                {error && <p className="text-sm whitespace-pre-line text-red-600">{error}</p>}
                <EmailVerification
                    storefrontSlug={storefrontSlug}
                    purpose="checkout"
                    defaultEmail={signedInEmail}
                    lockEmail={signedInEmail !== null}
                />
            </section>
        );
    }

    return (
        <section className="flex flex-col gap-3 rounded-lg border border-current/15 px-4 py-4">
            <p className="text-sm">
                <span className="opacity-70">Checking out as </span>
                <span className="font-medium">{buyer.email}</span>
                {signedInEmail === null && (
                    <>
                        {" · "}
                        <Button
                            variant="unstyled"
                            onClick={() => startTransition(() => forgetBuyer(storefrontSlug, "checkout"))}
                            disabled={pending}
                            className="underline opacity-70 hover:opacity-100"
                        >
                            Not you?
                        </Button>
                    </>
                )}
            </p>

            {buyer.blocked ? (
                <p className="text-sm text-red-600">You can&apos;t purchase from this store.</p>
            ) : unavailable ? (
                <p className="text-sm opacity-70">{unavailable}</p>
            ) : (
                <Button
                    variant="unstyled"
                    onClick={proceed}
                    disabled={pending}
                    className={`${PRIMARY_CLASS} w-full`}
                    style={PRIMARY_STYLE}
                >
                    {pending ? "Opening secure checkout…" : "Continue to payment"}
                </Button>
            )}

            {error && <p className="text-sm whitespace-pre-line text-red-600">{error}</p>}
        </section>
    );
}
