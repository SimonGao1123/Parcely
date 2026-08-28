import { getPage } from "@/lib/api/page/getPage";
import PageEditor from "@/app/(storefront)/_components/editor/pageEditor";
import { requireStorefrontOwner } from "@/app/(storefront)/_components/editor/requireOwner";
import { orderPages } from "@/app/(storefront)/_components/storefront/orderPages";
import { styleVars } from "@/app/(storefront)/_components/storefront/styleVars";
import { ThemedHeader, ThemedNavbar } from "@/app/(storefront)/_components/storefront/themed/registry";

export default async function EditPage({ params }: PageProps<"/[storefrontSlug]/[pageSlug]/edit">) {
    const { storefrontSlug, pageSlug } = await params;

    // independent requests — awaiting them in sequence would waterfall
    const [page, storefront] = await Promise.all([
        getPage(storefrontSlug, pageSlug),
        requireStorefrontOwner(storefrontSlug),
    ]);

    // ThemedNavbar directly rather than StorefrontNavbar: the latter is a client
    // component whose useNavbarVisibility binds scroll and mousemove listeners
    // and translates the bar out of view, which would slide the chrome around
    // mid-drag. Rendering the themed pieces here also keeps them off the client.
    //
    // pointer-events-none so the nav links can't navigate the owner out of the
    // editor, and aria-hidden since this is a preview of chrome rather than
    // usable navigation.
    const chrome = (
        <div
            style={styleVars(storefront.style)}
            aria-hidden
            className="pointer-events-none select-none"
        >
            <ThemedNavbar theme={storefront.theme} storefront={storefront} pages={orderPages(storefront)} />
            {/* matches the public page, which only renders the header on the
                homepage. Returns null for the timeless and professional themes. */}
            {page.is_homepage && <ThemedHeader theme={storefront.theme} storefront={storefront} />}
        </div>
    );

    return <PageEditor page={page} storefront={storefront} chrome={chrome} />;
}
