import { requireStorefrontOwner } from "@/app/(storefront)/_components/editor/requireOwner";
import StorefrontSettings from "@/app/(storefront)/_components/editor/storefrontSettings";

export default async function SettingsPage({ params }: PageProps<"/[storefrontSlug]/settings">) {
    const { storefrontSlug } = await params;
    const storefront = await requireStorefrontOwner(storefrontSlug);

    return <StorefrontSettings storefront={storefront} />;
}
