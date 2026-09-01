import { getCart } from "@/lib/api/cart/getCart";
import { getStorefrontDetails } from "@/lib/api/storefront/getStorefrontDetails";
import StorefrontNavbar from "@/app/(storefront)/_components/storefront/storefrontNavbar";
import { requireStorefrontOwner } from "@/app/(storefront)/_components/editor/requireOwner";
import { styleVars } from "@/app/(storefront)/_components/storefront/styleVars";

export default async function StorefrontLayout({ children, params }: { children: React.ReactNode, params: Promise<{ storefrontSlug: string }> }) {
    const {storefrontSlug} = await params;
    const storefront = await getStorefrontDetails(storefrontSlug);


    // awaited: requireStorefrontOwner 404s by throwing, and a floating promise
    // would let the draft render to everyone while the rejection went unhandled.
    if (storefront.is_draft) {
        await requireStorefrontOwner(storefrontSlug)

    }

    // null hides the cart icon entirely — a draft is not shoppable, and the
    // backend refuses cart calls against one. getCart is cache()d, so the cart
    // page's own call in this render costs nothing extra.
    const cart = storefront.is_draft ? null : await getCart(storefrontSlug);
    const cartCount =
        storefront.is_draft
            ? null
            : cart && !("error" in cart)
              ? cart.items.reduce((total, item) => total + item.quantity, 0)
              : 0;


    return (
        // flex-1 fills the body's remaining height, so the storefront background
        // covers the viewport even on a page shorter than the screen.
        //
        // padding rather than margin for the nav offset: margins are transparent,
        // so the strip behind the bar would show the page background through it
        // whenever the navbar hides on scroll. Top only — the grid below is a
        // container whose 100cqw has to keep matching its own column width.
        <div
            style={{ ...styleVars(storefront.style), paddingTop: "var(--sf-nav-h)" }}
            className="flex-1 bg-[var(--sf-bg)] text-[var(--sf-fg)]"
        >
            <StorefrontNavbar storefront={storefront} cartCount={cartCount} />
            {children}
        </div>
    )
}