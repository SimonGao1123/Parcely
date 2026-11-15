import StorePurchasesView from "@/app/(storefront)/_components/purchases/storePurchasesView";
import { pageParam } from "@/components/purchases/pager";

export default async function StoreSubscriptionsPage({
    params,
    searchParams,
}: {
    params: Promise<{ storefrontSlug: string }>;
    searchParams: Promise<{ page?: string | string[] }>;
}) {
    const [{ storefrontSlug }, query] = await Promise.all([params, searchParams]);
    return <StorePurchasesView storefrontSlug={storefrontSlug} kind="subscriptions" page={pageParam(query.page)} />;
}
