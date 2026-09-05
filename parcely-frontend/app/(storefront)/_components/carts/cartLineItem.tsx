'use client';

import { useState, useTransition } from "react";
import Button from "@/components/button";
import { updateCartItem } from "@/lib/api/cart/updateCartItem";
import { formatPrice, planIntervalPhrase, planIntervalSuffix, planName } from "@/lib/price";
import type { MediaBlob } from "@/types/blob";
import type { CartItem } from "@/types/cart";
import type { Currency } from "@/types/storefront";
import BlobMedia from "@/app/(storefront)/_components/pageblock/blocks/blobMedia";

export default function CartLineItem({
    storefrontSlug,
    item,
    currency,
    fallbackImage,
}: {
    storefrontSlug: string;
    item: CartItem;
    currency: Currency;
    // the storefront logo, standing in for a product that has no image
    fallbackImage: MediaBlob | null;
}) {
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const { plan, quantity } = item;
    const { product } = plan;
    const suffix = planIntervalSuffix(plan);
    const phrase = planIntervalPhrase(plan);

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
                <Thumbnail image={product.display_image} fallback={fallbackImage} />

                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium">{product.name}</span>
                    <span className="text-sm opacity-70">
                        {planName(plan)}
                        {suffix && ` / ${suffix}`}
                    </span>

                    {/* phrase is non-null exactly when the plan has an interval,
                        which is what makes the charge repeat. */}
                    {phrase ? (
                        <>
                            <span className="mt-1 text-xs font-semibold tracking-widest uppercase">
                                Recurring payment
                            </span>
                            <span className="text-sm opacity-70">Billed {phrase}</span>
                        </>
                    ) : (
                        <span className="text-sm opacity-70">
                            {formatPrice(plan.price_cents, currency)} each
                        </span>
                    )}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="font-medium">
                        {formatPrice(plan.price_cents * quantity, currency)}
                    </span>

                    {/* A subscription's only legal quantity is 1, so there is
                        nothing to step and the backend would 400 on the attempt. */}
                    {!product.is_subscription && (
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

// Always occupies the box, image or not, so every row in the list shares one
// left edge. A logo standing in for a missing product photo is letterboxed
// rather than cropped — a cover crop of a wide wordmark reads as noise.
function Thumbnail({ image, fallback }: { image: MediaBlob | null; fallback: MediaBlob | null }) {
    const blob = image ?? fallback;

    return (
        <div className="size-20 shrink-0 overflow-hidden rounded bg-current/5">
            {blob && (
                <BlobMedia
                    blob={blob}
                    className={image ? "size-full object-cover" : "size-full object-contain p-2"}
                />
            )}
        </div>
    );
}
