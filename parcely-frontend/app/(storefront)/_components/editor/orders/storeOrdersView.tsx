import Link from "next/link";
import SettingsTabs from "@/app/(storefront)/_components/editor/settingsTabs";
import LinkTabs from "@/components/linkTabs";
import Pager from "@/components/purchases/pager";
import ReceiptCard from "@/components/purchases/receiptCard";
import SubscriptionCard from "@/components/purchases/subscriptionCard";
import { getStoreCustomers, getStoreOrders, getStoreSubscriptions } from "@/lib/api/dashboard/getDashboard";
import type { Paginated } from "@/types/api";
import type { Storefront } from "@/types/storefront";
import CustomerTable from "./customerTable";

export type OrdersView = "orders" | "subscriptions" | "customers";
export type SubscriptionFilter = "live" | "ended" | undefined;

// The seller's side of Purchases: what this storefront sold, who bought it, and
// the one action a seller takes on a buyer - removing them.
export default async function StoreOrdersView({
    storefront,
    view,
    status,
    page,
}: {
    storefront: Storefront;
    view: OrdersView;
    status: SubscriptionFilter;
    page: number;
}) {
    const slug = storefront.slug;
    const href = (params: { view?: OrdersView; status?: SubscriptionFilter; page?: number }) => {
        const search = new URLSearchParams();
        const nextView = params.view ?? view;
        if (nextView !== "orders") search.set("view", nextView);
        if (nextView === "subscriptions" && params.status) search.set("status", params.status);
        if (params.page && params.page > 1) search.set("page", String(params.page));
        const text = search.toString();
        return `/${slug}/orders${text ? `?${text}` : ""}`;
    };

    return (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10 text-stone-800">
            <div className="flex items-center justify-between">
                <Link href={`/${slug}/settings`} className="text-sm text-stone-600 hover:text-stone-950">
                    ← Back to settings
                </Link>
                <h1 className="text-lg font-semibold text-stone-900">Orders</h1>
            </div>

            <SettingsTabs storefrontSlug={slug} active="orders" />

            <LinkTabs
                tabs={[
                    { href: href({ view: "orders" }), label: "Orders", active: view === "orders" },
                    { href: href({ view: "subscriptions" }), label: "Subscriptions", active: view === "subscriptions" },
                    { href: href({ view: "customers" }), label: "Customers", active: view === "customers" },
                ]}
            />

            {view === "subscriptions" && (
                <div className="flex gap-3 text-sm">
                    {([undefined, "live", "ended"] as const).map((option) => (
                        <Link
                            key={option ?? "all"}
                            href={href({ status: option })}
                            aria-current={status === option ? "page" : undefined}
                            className={status === option ? "font-medium text-stone-900" : "text-stone-500 hover:text-stone-800"}
                        >
                            {option === undefined ? "All" : option === "live" ? "Live" : "Ended"}
                        </Link>
                    ))}
                </div>
            )}

            {view === "orders" && (
                <Section
                    data={await getStoreOrders(slug, page)}
                    empty="No orders yet."
                    page={page}
                    hrefFor={(next) => href({ page: next })}
                    render={(receipts) => (
                        <ul className="flex flex-col gap-3">
                            {receipts.map((receipt) => (
                                <ReceiptCard
                                    key={receipt.id}
                                    receipt={receipt}
                                    aside={<Buyer email={receipt.customer.email} />}
                                />
                            ))}
                        </ul>
                    )}
                />
            )}

            {view === "subscriptions" && (
                <Section
                    data={await getStoreSubscriptions(slug, status, page)}
                    empty="No subscriptions yet."
                    page={page}
                    hrefFor={(next) => href({ status, page: next })}
                    render={(subscriptions) => (
                        <ul className="flex flex-col gap-3">
                            {subscriptions.map((subscription) => (
                                <SubscriptionCard
                                    key={subscription.id}
                                    subscription={subscription}
                                    aside={<Buyer email={subscription.customer.email} />}
                                />
                            ))}
                        </ul>
                    )}
                />
            )}

            {view === "customers" && (
                <Section
                    data={await getStoreCustomers(slug, page)}
                    empty="No customers yet."
                    page={page}
                    hrefFor={(next) => href({ page: next })}
                    render={(customers) => (
                        <CustomerTable storefrontSlug={slug} currency={storefront.currency} customers={customers} />
                    )}
                />
            )}
        </div>
    );
}

function Buyer({ email }: { email: string }) {
    return <p className="border-t border-stone-200 pt-2 text-sm text-stone-600">Buyer: {email}</p>;
}

function Section<T>({
    data,
    empty,
    page,
    hrefFor,
    render,
}: {
    data: Paginated<T> | { error: string };
    empty: string;
    page: number;
    hrefFor: (page: number) => string;
    render: (results: T[]) => React.ReactNode;
}) {
    if ("error" in data) {
        return <p className="text-sm whitespace-pre-line text-red-600">{data.error}</p>;
    }
    if (data.results.length === 0) {
        return (
            <p className="rounded-lg border border-dashed border-stone-300 px-4 py-8 text-center text-sm text-stone-500">
                {empty}
            </p>
        );
    }
    return (
        <div className="flex flex-col gap-4">
            {render(data.results)}
            <Pager data={data} page={page} hrefFor={hrefFor} />
        </div>
    );
}
