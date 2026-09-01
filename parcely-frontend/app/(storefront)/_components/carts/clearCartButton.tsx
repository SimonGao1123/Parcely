'use client';

import { useState, useTransition } from "react";
import Button from "@/components/button";
import { clearCart } from "@/lib/api/cart/clearCart";

export default function ClearCartButton({ storefrontSlug }: { storefrontSlug: string }) {
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    // Emptying the cart is not undoable, so the first press only arms the
    // second. Inline rather than window.confirm, which is blocking and unstyled.
    const [armed, setArmed] = useState(false);

    const onClick = () => {
        if (!armed) {
            setArmed(true);
            return;
        }

        startTransition(async () => {
            setError(null);
            const result = await clearCart(storefrontSlug);
            if (result) {
                setError(result.error);
                setArmed(false);
            }
        });
    };

    return (
        <div className="flex flex-col items-end gap-1">
            <Button
                variant="unstyled"
                onClick={onClick}
                onBlur={() => setArmed(false)}
                disabled={pending}
                className="text-sm underline opacity-70 transition-opacity hover:opacity-100"
            >
                {pending ? "Clearing…" : armed ? "Confirm clear" : "Clear cart"}
            </Button>

            {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
    );
}
