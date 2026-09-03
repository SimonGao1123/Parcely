import Link from "next/link";
import { notFound } from "next/navigation";
import CartLineItem from "@/app/(storefront)/_components/carts/cartLineItem";
import ClearCartButton from "@/app/(storefront)/_components/carts/clearCartButton";
import { orderPages } from "@/app/(storefront)/_components/storefront/orderPages";
import { getCart } from "@/lib/api/cart/getCart";
import { getStorefrontDetails } from "@/lib/api/storefront/getStorefrontDetails";
import { formatPrice } from "@/lib/price";

export default async function CartPage({
    params,
}: {
    params: Promise<{ storefrontSlug: string }>;
}) {
    const { storefrontSlug } = await params;

    // independent requests — awaiting them in sequence would waterfall
    const [storefront, cart] = await Promise.all([
        getStorefrontDetails(storefrontSlug),
        getCart(storefrontSlug),
    ]);

    // The layout already gates drafts to their owner; this keeps the owner from
    // reaching a cart page for a storefront the backend refuses to serve carts for.
    if (storefront.is_draft) notFound();

    if (cart && "error" in cart) {
        return (
            <Shell>
                <p className="text-sm text-red-600">{cart.error}</p>
            </Shell>
        );
    }

    // null is the 204 — no cart row yet, which reads the same as an emptied one
    if (!cart || cart.items.length === 0) {
        // There is no route at /<storefrontSlug>, so this has to name a page.
        // orderPages puts the homepage first and falls back to whatever page
        // exists when the storefront has not designated one.
        const landing = orderPages(storefront)[0];

        return (
            <Shell>
                <p className="opacity-70">Your cart is empty.</p>
                {landing && (
                    <Link
                        href={`/${storefrontSlug}/${landing.slug}`}
                        className="text-sm underline opacity-70"
                    >
                        Continue shopping
                    </Link>
                )}
            </Shell>
        );
    }

    return (
        <Shell>
            <ul className="flex flex-col">
                {cart.items.map((item) => (
                    <CartLineItem
                        key={item.id}
                        storefrontSlug={storefrontSlug}
                        item={item}
                        currency={storefront.currency}
                    />
                ))}
            </ul>

            <div className="flex items-start justify-between pt-5">
                <div className="flex flex-col gap-0.5">
                    <span className="text-sm opacity-70">Total</span>
                    <span className="text-2xl font-semibold">
                        {formatPrice(cart.total_cents, storefront.currency)}
                    </span>
                </div>

                <ClearCartButton storefrontSlug={storefrontSlug} />
            </div>
        </Shell>
    );
}

function Shell({ children }: { children: React.ReactNode }) {
    return (
        <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-6 py-12 font-[family-name:var(--sf-font)]">
            <h1 className="text-3xl font-semibold">Cart</h1>
            {children}
        </main>
    );
}
