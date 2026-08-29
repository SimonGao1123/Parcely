'use client';

import Image from "next/image";
import Button from "@/components/button";
import { formatPrice, planLabel } from "@/lib/price";
import type { Plan, Product } from "@/types/product";

function Pill({ children, tone }: { children: React.ReactNode; tone: "neutral" | "warn" }) {
    const colors = tone === "warn" ? "bg-amber-100 text-amber-800" : "bg-stone-100 text-stone-600";
    return (
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wider ${colors}`}>
            {children}
        </span>
    );
}

export default function ProductRow({
    product,
    pending,
    onEdit,
    onDelete,
    onAddPlan,
    onEditPlan,
    onDeletePlan,
}: {
    product: Product;
    pending: boolean;
    onEdit: () => void;
    onDelete: () => void;
    onAddPlan: () => void;
    onEditPlan: (plan: Plan) => void;
    onDeletePlan: (plan: Plan) => void;
}) {
    return (
        <li className="flex flex-col gap-3 px-4 py-3">
            <div className="flex items-center gap-3">
                {/* presigned urls expire, so they can't be optimized */}
                {product.display_image ? (
                    <Image
                        src={product.display_image.url}
                        alt=""
                        width={40}
                        height={40}
                        unoptimized
                        className="size-10 rounded object-cover"
                    />
                ) : (
                    <span className="size-10 rounded border border-dashed border-stone-300" />
                )}

                <div className="flex flex-1 flex-col">
                    <span className="text-sm font-medium text-stone-900">{product.name}</span>
                    <span className="line-clamp-1 text-xs text-stone-500">{product.description}</span>
                </div>

                <Pill tone="neutral">{product.is_subscription ? "SUBSCRIPTION" : "ONE-TIME"}</Pill>
                {!product.is_active && <Pill tone="warn">INACTIVE</Pill>}

                <Button variant="link" onClick={onEdit}>
                    Edit
                </Button>
                <Button
                    variant="link"
                    disabled={pending}
                    onClick={onDelete}
                    className="text-red-600 hover:text-red-800"
                >
                    Delete
                </Button>
            </div>

            <div className="flex flex-col gap-2 border-l-2 border-stone-100 pl-4">
                {product.plans.length === 0 ? (
                    <span className="text-xs text-stone-500">
                        No plans yet — a product with no plans renders without any buttons.
                    </span>
                ) : (
                    product.plans.map((plan) => (
                        <div key={plan.id} className="flex items-center gap-3">
                            <span className="flex-1 text-sm text-stone-800">
                                {planLabel(plan, product.currency)}
                            </span>

                            {/* The label collapses to the title when there is
                                one, so the raw price is shown alongside it. */}
                            {plan.title && (
                                <span className="text-xs text-stone-500">
                                    {formatPrice(plan.price_cents, product.currency)}
                                </span>
                            )}
                            {plan.trial_period_days ? (
                                <Pill tone="neutral">{plan.trial_period_days}-DAY TRIAL</Pill>
                            ) : null}

                            <Button variant="link" onClick={() => onEditPlan(plan)}>
                                Edit
                            </Button>
                            <Button
                                variant="link"
                                disabled={pending}
                                onClick={() => onDeletePlan(plan)}
                                className="text-red-600 hover:text-red-800"
                            >
                                Delete
                            </Button>
                        </div>
                    ))
                )}

                <Button variant="outline" onClick={onAddPlan} className="self-start">
                    Add plan
                </Button>
            </div>
        </li>
    );
}
