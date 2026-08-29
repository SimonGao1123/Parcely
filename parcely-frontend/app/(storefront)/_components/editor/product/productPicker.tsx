'use client';

import Image from "next/image";
import Link from "next/link";
import Button from "@/components/button";
import { formatPrice } from "@/lib/price";
import type { Product } from "@/types/product";

function cheapest(product: Product): string | null {
    if (product.plans.length === 0) return null;
    const lowest = Math.min(...product.plans.map((plan) => plan.price_cents));
    return formatPrice(lowest, product.currency);
}

// A list of selectable rows rather than a <select>: picking a product to put on
// a page is a visual decision, and the whole catalogue is already in memory
// from the route's fetch, so there is nothing to load.
export default function ProductPicker({
    products,
    value,
    onChange,
    storefrontSlug,
}: {
    products: Product[];
    value: number | null;
    onChange: (productId: number) => void;
    storefrontSlug: string;
}) {
    if (products.length === 0) {
        return (
            <p className="rounded-lg border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-500">
                No products yet.{" "}
                <Link
                    href={`/${storefrontSlug}/products`}
                    className="underline hover:text-stone-800"
                >
                    Create one
                </Link>{" "}
                to place it on a page.
            </p>
        );
    }

    // The block's stored product_id is kept even when it no longer resolves, so
    // that saving an unrelated change re-sends the same id instead of silently
    // swapping the product. Mirrors the media picker's "Unavailable" tile.
    const missing = value !== null && !products.some((product) => product.id === value);

    return (
        <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-stone-700">Product</span>

            {/* Capped and scrollable: the list is unpaginated, so a large
                catalogue would otherwise push the modal past the viewport. */}
            <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-lg border border-stone-200 p-1">
                {missing && (
                    <li>
                        <span className="flex w-full items-center gap-3 rounded-lg border-2 border-sky-500 bg-sky-50 px-2 py-1.5 text-left">
                            <span className="size-10 rounded border border-dashed border-stone-300" />
                            <span className="flex-1 text-sm text-stone-500">
                                Unavailable (#{value})
                            </span>
                        </span>
                    </li>
                )}

                {products.map((product) => {
                    const price = cheapest(product);
                    return (
                        <li key={product.id}>
                            <Button
                                variant="unstyled"
                                aria-pressed={value === product.id}
                                onClick={() => onChange(product.id)}
                                className={`flex w-full items-center gap-3 rounded-lg border-2 px-2 py-1.5 text-left ${
                                    value === product.id
                                        ? "border-sky-500 bg-sky-50"
                                        : "border-transparent hover:bg-stone-50"
                                }`}
                            >
                                {/* presigned urls expire, so they can't be optimized */}
                                {product.display_image ? (
                                    <Image
                                        src={product.display_image.url}
                                        alt=""
                                        width={40}
                                        height={40}
                                        unoptimized
                                        className="size-10 shrink-0 rounded object-cover"
                                    />
                                ) : (
                                    <span className="size-10 shrink-0 rounded border border-dashed border-stone-300" />
                                )}

                                <span className="flex flex-1 flex-col">
                                    <span className="text-sm text-stone-900">{product.name}</span>
                                    <span className="text-xs text-stone-500">
                                        {product.is_subscription ? "Subscription" : "One-time"}
                                        {price ? ` · from ${price}` : " · no plans"}
                                    </span>
                                </span>

                                {!product.is_active && (
                                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold tracking-wider text-amber-800">
                                        INACTIVE
                                    </span>
                                )}
                            </Button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
