import type { PurchaseKind, PurchasePage } from "@/lib/api/purchases/getPurchases";
import type { PurchasedSubscription, Receipt } from "@/types/purchases";
import Pager from "./pager";
import ReceiptCard from "./receiptCard";
import SubscriptionCard from "./subscriptionCard";

// The body of one Purchases subtab, shared by the platform-wide page and each
// storefront's own. The caller has already resolved who may see it.
export default function PurchaseList({
    kind,
    data,
    page,
    hrefFor,
    showStorefront,
}: {
    kind: PurchaseKind;
    data: PurchasePage | { error: string };
    page: number;
    hrefFor: (page: number) => string;
    showStorefront: boolean;
}) {
    if ("error" in data) {
        return <p className="text-sm whitespace-pre-line text-red-600">{data.error}</p>;
    }

    if (data.results.length === 0) {
        return (
            <p className="rounded-lg border border-dashed border-current/30 px-4 py-8 text-center text-sm opacity-70">
                {kind === "subscriptions" ? "No subscriptions yet." : "No orders yet."}
            </p>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <ul className="flex flex-col gap-3">
                {kind === "subscriptions"
                    ? (data.results as PurchasedSubscription[]).map((sub) => (
                          <SubscriptionCard key={sub.id} subscription={sub} showStorefront={showStorefront} />
                      ))
                    : (data.results as Receipt[]).map((receipt) => (
                          <ReceiptCard key={receipt.id} receipt={receipt} showStorefront={showStorefront} />
                      ))}
            </ul>
            <Pager data={data} page={page} hrefFor={hrefFor} />
        </div>
    );
}
