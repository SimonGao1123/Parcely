'use client';

import { useState, useTransition } from "react";
import Button from "@/components/button";
import { createCartItem } from "@/lib/api/cart/createCartItem";

export default function AddToCartButton({
    storefrontSlug,
    planId,
    quantity,
}: {
    storefrontSlug: string;
    planId: number;
    quantity: number;
}) {
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    // Which selection was added, rather than a bare flag — otherwise the
    // confirmation would still be showing after the shopper picks another plan.
    const [addedSelection, setAddedSelection] = useState<string | null>(null);

    const selection = `${planId}:${quantity}`;
    const added = addedSelection === selection;

    const onClick = () =>
        startTransition(async () => {
            setError(null);
            const result = await createCartItem(storefrontSlug, {
                plan_id: planId,
                quantity,
            });

            if ("error" in result) {
                setError(result.error);
                return;
            }

            // Confirmation lives on the button because a storefront page has no
            // cart display yet to notice the change.
            setAddedSelection(selection);
        });

    return (
        <div className="flex flex-col gap-[0.4em]">
            <Button
                variant="unstyled"
                onClick={onClick}
                disabled={pending}
                className="w-full rounded-lg px-[0.85em] py-[0.7em] text-[0.95em] font-medium"
                style={{ background: "var(--sf-fg)", color: "var(--sf-bg)" }}
            >
                {pending ? "Adding…" : added ? "Added to cart" : "Add to cart"}
            </Button>

            {error && <p className="text-[0.75em] text-red-600">{error}</p>}
        </div>
    );
}
