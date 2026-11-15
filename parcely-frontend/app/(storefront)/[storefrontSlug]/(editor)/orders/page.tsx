import { requireStorefrontOwner } from "@/app/(storefront)/_components/editor/requireOwner";
import StoreOrdersView, {
    type OrdersView,
    type SubscriptionFilter,
} from "@/app/(storefront)/_components/editor/orders/storeOrdersView";
import { pageParam } from "@/components/purchases/pager";

const VIEWS: OrdersView[] = ["orders", "subscriptions", "customers"];

export default async function OrdersPage({
    params,
    searchParams,
}: {
    params: Promise<{ storefrontSlug: string }>;
    searchParams: Promise<{ view?: string; status?: string; page?: string | string[] }>;
}) {
    const [{ storefrontSlug }, query] = await Promise.all([params, searchParams]);

    // 404s anyone but the owner, as the other settings tabs do. The backend
    // checks ownership again on every one of these reads.
    const storefront = await requireStorefrontOwner(storefrontSlug);

    const view = VIEWS.find((entry) => entry === query.view) ?? "orders";
    const status: SubscriptionFilter =
        query.status === "live" || query.status === "ended" ? query.status : undefined;

    return <StoreOrdersView storefront={storefront} view={view} status={status} page={pageParam(query.page)} />;
}
