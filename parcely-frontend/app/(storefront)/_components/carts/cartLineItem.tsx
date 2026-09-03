'use client';

import { useState, useTransition } from "react";
import Button from "@/components/button";
import { updateCartItem } from "@/lib/api/cart/updateCartItem";
import { formatPrice, planIntervalSuffix, planName } from "@/lib/price";
import type { CartItem } from "@/types/cart";
import type { Currency } from "@/types/storefront";
import BlobMedia from "@/app/(storefront)/_components/pageblock/blocks/blobMedia";

export default function CartLineItem({
    storefrontSlug,
    item,
    currency,
}: {
    storefrontSlug: string;
    item: CartItem;
    currency: Currency;
}) {
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const { plan, quantity } = item;
    const { product } = plan;
    const suffix = planIntervalSuffix(plan);

    // No local copy of the quantity: updateCartItem calls refresh(), so the
    // server's cart stays the only source of truth and the line total, the
    // cart total and the navbar badge all move together.
    const setQuantity = (next: number) =>
        startTransition(async () => {
            setError(null);
            const result = await updateCartItem(storefrontSlug, item.id, next);
            if (result) setError(result.error);
        });

    return (
        <li className="flex flex-col gap-2 border-b border-current/15 py-5">
            <div className="flex items-start gap-4">
                {product.display_image && (
                    <div className="size-20 shrink-0 overflow-hidden rounded">
                        <BlobMedia
                            blob={product.display_image}
                            className="size-full object-cover"
                        />
                    </div>
                )}

                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium">{product.name}</span>
                    <span className="text-sm opacity-70">
                        {planName(plan)}
                        {suffix && ` / ${suffix}`}
                    </span>
                    <span className="text-sm opacity-70">
                        {formatPrice(plan.price_cents, currency)} each
                    </span>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="font-medium">
                        {formatPrice(plan.price_cents * quantity, currency)}
                    </span>

                    {/* A subscription's only legal quantity is 1, so there is
                        nothing to step and the backend would 400 on the attempt. */}
                    {product.is_subscription ? (
                        <span className="text-sm opacity-70">Subscription</span>
                    ) : (
                        <div className="flex items-center gap-1">
                            <Button
                                variant="unstyled"
                                aria-label="Decrease quantity"
                                onClick={() => setQuantity(quantity - 1)}
                                disabled={pending}
                                className="size-7 rounded border border-current/30 leading-none"
                            >
                                −
                            </Button>
                            <span className="w-7 text-center text-sm tabular-nums">{quantity}</span>
                            <Button
                                variant="unstyled"
                                aria-label="Increase quantity"
                                onClick={() => setQuantity(quantity + 1)}
                                disabled={pending}
                                className="size-7 rounded border border-current/30 leading-none"
                            >
                                +
                            </Button>
                        </div>
                    )}

                    {/* Zero is the endpoint's remove signal, so decrementing to
                        nothing and pressing Remove take the same path. */}
                    <Button
                        variant="unstyled"
                        onClick={() => setQuantity(0)}
                        disabled={pending}
                        className="text-sm underline opacity-70 transition-opacity hover:opacity-100"
                    >
                        {pending ? "Updating…" : "Remove"}
                    </Button>
                </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
        </li>
    );
}
