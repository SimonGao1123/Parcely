import Link from "next/link";
import { formatPrice } from "@/lib/price";
import type { Receipt } from "@/types/purchases";
import { cardLabel, formatDate } from "./format";
import StatusBadge from "./statusBadge";

// One payment and the lines it paid for. There is no status to show beyond Paid:
// a Payment row only exists once money has moved.
export default function ReceiptCard({
    receipt,
    showStorefront = false,
    aside,
}: {
    receipt: Receipt;
    showStorefront?: boolean;
    aside?: React.ReactNode;
}) {
    const card = cardLabel(receipt.card_brand, receipt.card_last4);

    return (
        <li className="flex flex-col gap-2 rounded-lg border border-current/15 px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-col">
                    <span className="font-medium">{formatDate(receipt.created_at)}</span>
                    <span className="text-sm opacity-70">
                        {receipt.kind === "subscription" ? "Subscription payment" : "One-time purchase"}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <StatusBadge label="Paid" tone="good" />
                    <span className="font-semibold">
                        {formatPrice(receipt.amount_cents, receipt.currency)}
                    </span>
                </div>
            </div>

            {receipt.orders.length > 0 && (
                <ul className="flex flex-col gap-0.5 text-sm">
                    {receipt.orders.map((line) => (
                        <li key={line.id} className="flex justify-between gap-4">
                            <span className="min-w-0 truncate">
                                {line.plan_name_snapshot}
                                {line.quantity > 1 && <span className="opacity-70"> × {line.quantity}</span>}
                            </span>
                            <span className="shrink-0 opacity-70">
                                {formatPrice(line.unit_price_cents * line.quantity, receipt.currency)}
                            </span>
                        </li>
                    ))}
                </ul>
            )}

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm opacity-70">
                {showStorefront && receipt.storefront && (
                    <Link href={`/${receipt.storefront.slug}/purchases`} className="underline">
                        {receipt.storefront.title}
                    </Link>
                )}
                {card && <span>{card}</span>}
            </div>

            {aside}
        </li>
    );
}
