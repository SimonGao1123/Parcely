'use client';

import { useState } from "react";
import Button from "@/components/button";
import type { PlanInput } from "@/lib/api/product/planActions";
import type { BillingInterval, Plan, Product } from "@/types/product";
import type { Currency } from "@/types/storefront";
import { INPUT_CLASS } from "./productForm";

const INTERVALS: BillingInterval[] = ["day", "week", "month", "year"];

export default function PlanForm({
    product,
    currency,
    plan,
    pending,
    onSubmit,
    onCancel,
}: {
    // drives the shape of the form: the interval fields are required on a
    // subscription and rejected outright on a one-time product
    product: Product;
    currency: Currency;
    // absent in the create flow
    plan?: Plan;
    pending: boolean;
    onSubmit: (value: PlanInput) => Promise<boolean>;
    onCancel: () => void;
}) {
    const [title, setTitle] = useState(plan?.title ?? "");
    // Held in currency units, stored in cents — converted at submit.
    const [price, setPrice] = useState(plan ? (plan.price_cents / 100).toString() : "");
    const [interval, setInterval] = useState<BillingInterval>(plan?.billing_interval ?? "month");
    const [intervalCount, setIntervalCount] = useState(
        plan?.billing_interval_count?.toString() ?? "1",
    );
    const [trial, setTrial] = useState(plan?.trial_period_days?.toString() ?? "");

    const cents = Math.round(Number(price) * 100);
    const count = Number(intervalCount);

    const canSubmit =
        price.trim().length > 0 &&
        Number.isFinite(cents) &&
        cents >= 0 &&
        (!product.is_subscription || (Number.isInteger(count) && count >= 1));

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!canSubmit) return;

        const value: PlanInput = {
            title: title.trim() || null,
            price_cents: cents,
        };

        // Omitted rather than nulled for a one-time product: Plan.clean()
        // rejects all three as non-null there, and leaving them out says the
        // same thing without relying on that.
        if (product.is_subscription) {
            value.billing_interval = interval;
            value.billing_interval_count = count;
            value.trial_period_days = trial.trim() ? Number(trial) : null;
        }

        await onSubmit(value);
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-stone-700">Title</span>
                <input
                    type="text"
                    value={title}
                    maxLength={255}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Optional — the price is shown when this is blank"
                    className={INPUT_CLASS}
                />
            </label>

            <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-stone-700">
                    Price ({currency.toUpperCase()})
                </span>
                <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0.00"
                    className={INPUT_CLASS}
                />
            </label>

            {product.is_subscription && (
                <>
                    <div className="flex gap-3">
                        <label className="flex flex-1 flex-col gap-1">
                            <span className="text-sm font-medium text-stone-700">Bill every</span>
                            <input
                                type="number"
                                min={1}
                                value={intervalCount}
                                onChange={(e) => setIntervalCount(e.target.value)}
                                className={INPUT_CLASS}
                            />
                        </label>
                        <label className="flex flex-1 flex-col gap-1">
                            <span className="text-sm font-medium text-stone-700">Interval</span>
                            <select
                                value={interval}
                                onChange={(e) => setInterval(e.target.value as BillingInterval)}
                                className={INPUT_CLASS}
                            >
                                {INTERVALS.map((option) => (
                                    <option key={option} value={option}>
                                        {option}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <label className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-stone-700">Trial period</span>
                        <input
                            type="number"
                            min={0}
                            value={trial}
                            onChange={(e) => setTrial(e.target.value)}
                            placeholder="No trial"
                            className={INPUT_CLASS}
                        />
                        <span className="text-xs text-stone-500">Days before the first charge.</span>
                    </label>
                </>
            )}

            <div className="flex items-center justify-end gap-3 border-t border-stone-200 pt-4">
                <Button variant="link" onClick={onCancel}>
                    Cancel
                </Button>
                <Button type="submit" disabled={pending || !canSubmit}>
                    {plan ? "Save" : "Add plan"}
                </Button>
            </div>
        </form>
    );
}
