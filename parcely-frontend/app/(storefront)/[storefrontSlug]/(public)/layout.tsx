import { getStorefrontDetails } from "@/lib/api/storefront/getStorefrontDetails";
import StorefrontNavbar from "@/app/(storefront)/_components/storefront/storefrontNavbar";
import { requireStorefrontOwner } from "@/app/(storefront)/_components/editor/requireOwner";

export default async function StorefrontLayout({ children, params }: { children: React.ReactNode, params: Promise<{ storefrontSlug: string }> }) {
    const {storefrontSlug} = await params;
    const storefront = await getStorefrontDetails(storefrontSlug);


    if (storefront.is_draft) {
        requireStorefrontOwner(storefrontSlug)

    }


    return (
        <>
            <StorefrontNavbar storefront={storefront} />
            {children}
        </>
    )
}