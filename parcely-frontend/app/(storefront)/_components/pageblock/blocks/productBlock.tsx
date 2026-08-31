'use client';

import { useState } from "react";
import Button from "@/components/button";
import { formatPrice, planIntervalSuffix, planName } from "@/lib/price";
import type { ProductBlock as ProductBlockData } from "@/types/block";
import type { Currency, Plan } from "@/types/product";
import { objectPositionClass } from "./alignment";
import BlobMedia from "./blobMedia";

export default function ProductBlock({ block }: { block: ProductBlockData }) {
    const product = block.resolved_content;

    // Selecting a plan is the only thing these buttons do — there is no
    // checkout behind them yet. The hooks run before the null check because
    // they can't be skipped on a render where the product failed to resolve.
    const [selectedPlan, setSelectedPlan] = useState<number | null>(
        product?.plans[0]?.id ?? null,
    );
    const [quantity, setQuantity] = useState(1);

    // null means the product was deleted or moved out of the storefront — the
    // serializer resolves it against the storefront, not just the id. Same
    // contract as MediaBlock.
    if (!product) return null;

    const plan = product.plans.find((p) => p.id === selectedPlan) ?? product.plans[0] ?? null;
    const hasImage = Boolean(product.display_image);

    return (
        // Nested wrapper so the container query can target this block's width,
        // not the page grid's — @container on the same node as the grid
        // template would query itself, which CSS does not allow.
        //
        // minmax(0, …) tracks so the image's intrinsic size cannot grow the
        // cell past the grid row; overflow then clips instead of pushing the
        // add-to-cart button out of view.
        <div className="@container h-full min-h-0 w-full overflow-hidden">
            <div
                className={
                    hasImage
                        ? "grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(0,1.2fr)_minmax(0,1fr)] gap-[1em] @min-[24rem]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] @min-[24rem]:grid-rows-[minmax(0,1fr)]"
                        : "flex h-full min-h-0 flex-col"
                }
            >
                {product.display_image && (
                    <div className="min-h-0 min-w-0 overflow-hidden">
                        <BlobMedia
                            blob={product.display_image}
                            className={`h-full w-full object-cover ${objectPositionClass(block.style.alignment)}`}
                        />
                    </div>
                )}

                {/* em rather than rem so these still track --sf-font-scale, which
                    block.tsx applies to this subtree as a font-size */}
                <div className="flex min-h-0 min-w-0 flex-col gap-[0.55em] overflow-y-auto">
                    <div className="flex flex-col gap-[0.2em]">
                        <h3 className="text-[1.5em] leading-tight font-semibold">{product.name}</h3>
                        {product.description && (
                            <p className="text-[0.875em] whitespace-pre-wrap opacity-80">
                                {product.description}
                            </p>
                        )}
                    </div>

                    {plan && <SelectedPrice plan={plan} currency={product.currency} />}

                    {product.plans.length > 0 && (
                        <div className="flex flex-col gap-[0.4em]">
                            {product.plans.length > 1 && (
                                <span className="text-[0.75em] opacity-60">Choose your plan</span>
                            )}
                            {product.plans.map((option) => (
                                <PlanRow
                                    key={option.id}
                                    plan={option}
                                    currency={product.currency}
                                    active={option.id === selectedPlan}
                                    onSelect={() => setSelectedPlan(option.id)}
                                />
                            ))}
                        </div>
                    )}

                    {/* One-time products only. max_capacity is a subscription-only
                        field, so nothing here bounds the quantity. */}
                    {!product.is_subscription && (
                        <label className="flex items-center gap-2 text-[0.875em]">
                            <span>Quantity</span>
                            <input
                                type="number"
                                min={1}
                                value={quantity}
                                onChange={(event) =>
                                    setQuantity(
                                        Math.max(1, Math.floor(Number(event.target.value)) || 1),
                                    )
                                }
                                className="w-16 rounded border border-[var(--sf-fg)] bg-transparent px-2 py-1"
                            />
                        </label>
                    )}

                    {plan && (
                        <Button
                            variant="unstyled"
                            className="w-full rounded-lg px-[0.85em] py-[0.7em] text-[0.95em] font-medium"
                            style={{ background: "var(--sf-fg)", color: "var(--sf-bg)" }}
                        >
                            Add to cart
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}

function SelectedPrice({ plan, currency }: { plan: Plan; currency: Currency }) {
    const suffix = planIntervalSuffix(plan);
    return (
        <p className="text-[1.75em] leading-none font-semibold">
            {formatPrice(plan.price_cents, currency)}
            {suffix && <span className="text-[0.5em] font-normal opacity-60"> / {suffix}</span>}
        </p>
    );
}

function PlanRow({
    plan,
    currency,
    active,
    onSelect,
}: {
    plan: Plan;
    currency: Currency;
    active: boolean;
    onSelect: () => void;
}) {
    const suffix = planIntervalSuffix(plan);
    return (
        <Button
            variant="chip"
            aria-pressed={active}
            onClick={onSelect}
            className="flex w-full items-center justify-between gap-[0.75em] rounded-lg px-[0.85em] py-[0.65em] text-left text-[0.875em]"
            style={{
                color: "var(--sf-fg)",
                border: "2px solid",
                borderColor: active
                    ? "var(--sf-fg)"
                    : "color-mix(in srgb, var(--sf-fg) 40%, transparent)",
            }}
        >
            <span className="min-w-0 truncate font-medium">{planName(plan)}</span>
            <span className="shrink-0 opacity-80">
                {formatPrice(plan.price_cents, currency)}
                {suffix && `/${suffix}`}
            </span>
        </Button>
    );
}
