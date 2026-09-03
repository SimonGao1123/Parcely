'use client';

import Image from "next/image";
import Link from "next/link";
import Button from "@/components/button";
import { formatPrice, planLabel } from "@/lib/price";
import type { PageSummary } from "@/types/page";
import type { Plan, Product } from "@/types/product";
import type { Currency } from "@/types/storefront";
import PageForm, { type PageFormValue } from "../pageForm";

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
    page,
    storefrontSlug,
    currency,
    renamingPage,
    pending,
    onEdit,
    onDelete,
    onRenamePage,
    onCancelRenamePage,
    onSavePage,
    onError,
    onAddPlan,
    onEditPlan,
    onDeletePlan,
}: {
    product: Product;
    // every product gets one when it is created; absent only for a product
    // whose page was somehow removed out from under it
    page: PageSummary | undefined;
    storefrontSlug: string;
    currency: Currency;
    renamingPage: boolean;
    pending: boolean;
    onEdit: () => void;
    onDelete: () => void;
    onRenamePage: () => void;
    onCancelRenamePage: () => void;
    onSavePage: (value: PageFormValue) => Promise<boolean>;
    onError: (message: string) => void;
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

            {/* The product's own page. Editing its blocks uses the same editor
                as any other page — this is only the way in. It has no delete
                control: the page dies with the product. */}
            {page && (
                <div className="flex items-center gap-3 border-l-2 border-stone-100 pl-4">
                    {renamingPage ? (
                        <PageForm
                            initialTitle={page.title}
                            existingLogoUrl={page.logo_image?.url}
                            submitLabel="Save"
                            pending={pending}
                            onSubmit={onSavePage}
                            onError={onError}
                            onCancel={onCancelRenamePage}
                        />
                    ) : (
                        <>
                            <span className="text-[11px] font-semibold tracking-wider text-stone-400">
                                PAGE
                            </span>
                            <span className="flex-1 text-sm text-stone-800">{page.title}</span>

                            <Link
                                href={`/${storefrontSlug}/${page.slug}/edit`}
                                className="text-sm text-stone-500 underline hover:text-stone-800"
                            >
                                Edit blocks
                            </Link>

                            <Button variant="link" onClick={onRenamePage}>
                                Rename
                            </Button>
                        </>
                    )}
                </div>
            )}

            <div className="flex flex-col gap-2 border-l-2 border-stone-100 pl-4">
                {product.plans.length === 0 ? (
                    <span className="text-xs text-stone-500">
                        No plans yet — a product with no plans renders without any buttons.
                    </span>
                ) : (
                    product.plans.map((plan) => (
                        <div key={plan.id} className="flex items-center gap-3">
                            <span className="flex-1 text-sm text-stone-800">
                                {planLabel(plan, currency)}
                            </span>

                            {/* The label collapses to the title when there is
                                one, so the raw price is shown alongside it. */}
                            {plan.title && (
                                <span className="text-xs text-stone-500">
                                    {formatPrice(plan.price_cents, currency)}
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
