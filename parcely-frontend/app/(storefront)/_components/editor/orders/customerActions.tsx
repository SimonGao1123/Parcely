'use client';

import { useState, useTransition } from "react";
import Button from "@/components/button";
import { removeCustomer, unblockCustomer } from "@/lib/api/dashboard/customerActions";
import type { SellerCustomer } from "@/types/dashboard";

// Remove is two presses, like ClearCartButton: it cancels subscriptions at
// Stripe, which the buyer would have to sign up again to undo. The confirm step
// says how many, across every store, because that is what it does.
export default function CustomerActions({
    storefrontSlug,
    customer,
}: {
    storefrontSlug: string;
    customer: SellerCustomer;
}) {
    const [pending, startTransition] = useTransition();
    const [armed, setArmed] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const run = (action: () => Promise<{ error: string } | null>) =>
        startTransition(async () => {
            setError(null);
            const result = await action();
            setArmed(false);
            if (result) setError(result.error);
        });

    const live = customer.seller_live_subscription_count;

    return (
        <div className="flex flex-col items-end gap-1">
            {customer.blocked_at ? (
                <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() => run(() => unblockCustomer(storefrontSlug, customer.id))}
                >
                    {pending ? "Unblocking…" : "Unblock"}
                </Button>
            ) : armed ? (
                <div className="flex flex-col items-end gap-1">
                    <p className="max-w-56 text-right text-xs text-stone-600">
                        {live > 0
                            ? `Cancels ${live} live subscription${live === 1 ? "" : "s"} and blocks future purchases across all your stores.`
                            : "Blocks future purchases across all your stores."}
                    </p>
                    <div className="flex gap-2">
                        <Button variant="outline" disabled={pending} onClick={() => setArmed(false)}>
                            Keep
                        </Button>
                        <Button
                            disabled={pending}
                            onClick={() => run(() => removeCustomer(storefrontSlug, customer.id))}
                            className="bg-red-700 hover:bg-red-800"
                        >
                            {pending ? "Removing…" : "Confirm remove"}
                        </Button>
                    </div>
                </div>
            ) : (
                <Button variant="outline" onClick={() => setArmed(true)}>
                    Remove
                </Button>
            )}
            {error && <p className="max-w-56 text-right text-xs whitespace-pre-line text-red-600">{error}</p>}
        </div>
    );
}
