import { getStorefrontDetails } from "@/lib/api/storefront/getStorefrontDetails";
import StorefrontNavbar from "@/app/(storefront)/_components/storefront/storefrontNavbar";

export default async function StorefrontLayout({ children, params }: { children: React.ReactNode, params: Promise<{ storefrontSlug: string }> }) {
    const {storefrontSlug} = await params;
    const storefront = await getStorefrontDetails(storefrontSlug);

    return (
        <>
            <StorefrontNavbar storefront={storefront} />
            {children}
        </>
    )
}