import StatusBadge from "@/components/purchases/statusBadge";
import { formatDate } from "@/components/purchases/format";
import { formatPrice } from "@/lib/price";
import type { SellerCustomer } from "@/types/dashboard";
import type { Currency } from "@/types/storefront";
import CustomerActions from "./customerActions";

// Everyone who has bought from this storefront. Figures are for this store; the
// block a removal applies is per seller, so it reaches the seller's other stores.
export default function CustomerTable({
    storefrontSlug,
    currency,
    customers,
}: {
    storefrontSlug: string;
    currency: Currency;
    customers: SellerCustomer[];
}) {
    return (
        <ul className="flex flex-col divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
            {customers.map((customer) => (
                <li key={customer.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-medium text-stone-900">{customer.email}</span>
                            {customer.blocked_at ? (
                                <StatusBadge label="Blocked" tone="warn" />
                            ) : (
                                <StatusBadge label="Active" tone="good" />
                            )}
                        </div>
                        <span className="text-sm text-stone-600">
                            {customer.payment_count} order{customer.payment_count === 1 ? "" : "s"}
                            {" · "}
                            {formatPrice(customer.total_spent_cents, currency)} spent
                            {" · "}
                            {customer.live_subscription_count} live subscription
                            {customer.live_subscription_count === 1 ? "" : "s"}
                        </span>
                        <span className="text-xs text-stone-500">
                            Customer since {formatDate(customer.created_at)}
                            {customer.blocked_at && ` · blocked ${formatDate(customer.blocked_at)}`}
                        </span>
                    </div>
                    <CustomerActions storefrontSlug={storefrontSlug} customer={customer} />
                </li>
            ))}
        </ul>
    );
}
