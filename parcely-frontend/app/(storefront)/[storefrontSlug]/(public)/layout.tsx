import { getStorefrontDetails } from "@/lib/api/storefront/getStorefrontDetails";
import StorefrontNavbar from "@/app/(storefront)/_components/storefront/storefrontNavbar";
import { requireStorefrontOwner } from "@/app/(storefront)/_components/editor/requireOwner";
import { styleVars } from "@/app/(storefront)/_components/storefront/styleVars";

export default async function StorefrontLayout({ children, params }: { children: React.ReactNode, params: Promise<{ storefrontSlug: string }> }) {
    const {storefrontSlug} = await params;
    const storefront = await getStorefrontDetails(storefrontSlug);


    if (storefront.is_draft) {
        requireStorefrontOwner(storefrontSlug)

    }


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
            <StorefrontNavbar storefront={storefront} />
            {children}
        </div>
    )
}