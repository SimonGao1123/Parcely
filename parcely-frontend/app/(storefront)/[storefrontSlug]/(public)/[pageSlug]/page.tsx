import { getPage } from "@/lib/api/page/getPage";
import { getStorefrontDetails } from "@/lib/api/storefront/getStorefrontDetails";
import StorefrontHeader from "@/app/(storefront)/_components/storefront/storefrontHeader";
import PageGrid from "@/app/(storefront)/_components/pageblock/pageGrid";


export default async function Page({ params }: { params: Promise<{ storefrontSlug: string, pageSlug: string }> }) {
    const { storefrontSlug, pageSlug } = await params;

    // independent requests — awaiting them in sequence would waterfall
    const [page, storefront] = await Promise.all([
        getPage(storefrontSlug, pageSlug),
        getStorefrontDetails(storefrontSlug),
    ]);

    return <div>
        {page.is_homepage &&
        <StorefrontHeader storefront={storefront} />
        }
        <PageGrid page={page} storefront={storefront} />
    </div>;
}