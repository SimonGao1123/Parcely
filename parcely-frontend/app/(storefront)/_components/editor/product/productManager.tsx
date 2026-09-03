'use client';

import Link from "next/link";
import { useState } from "react";
import Button from "@/components/button";
import { updatePage } from "@/lib/api/page/updatePage";
import { createProduct } from "@/lib/api/product/createProduct";
import { deleteProduct } from "@/lib/api/product/deleteProduct";
import { createPlan, deletePlan, updatePlan, type PlanInput } from "@/lib/api/product/planActions";
import { updateProduct } from "@/lib/api/product/updateProduct";
import type { PageSummary } from "@/types/page";
import type { Plan, Product } from "@/types/product";
import type { Storefront } from "@/types/storefront";
import Modal from "../modal";
import type { PageFormValue } from "../pageForm";
import SettingsTabs from "../settingsTabs";
import PlanForm from "./planForm";
import ProductForm, { type ProductFormValue } from "./productForm";
import ProductRow from "./productRow";

type ProductModal = { mode: "create" } | { mode: "edit"; productId: number };
type PlanModal = { productId: number; planId?: number };

export default function ProductManager({
    storefront,
    products,
    pages,
}: {
    storefront: Storefront;
    products: Product[];
    // the product pages, one per product — they are left out of
    // storefront.pages, which is what the navbar and settings list read
    pages: PageSummary[];
}) {
    const [productModal, setProductModal] = useState<ProductModal | null>(null);
    const [planModal, setPlanModal] = useState<PlanModal | null>(null);
    const [renamingPageId, setRenamingPageId] = useState<number | null>(null);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Every mutation revalidates, so `products` arrives updated on the next
    // render — there is no local list to keep in sync, only the modal state to
    // clear. Same shape as PageManager.
    const run = async (action: () => Promise<{ error: string } | void>) => {
        setError(null);
        setPending(true);
        const result = await action();
        setPending(false);
        if (result?.error) {
            setError(result.error);
            return false;
        }
        return true;
    };

    // Looked up by id rather than held in the modal state, so a form stays
    // pointed at the freshly revalidated product after a plan is added to it.
    const editingProduct =
        productModal?.mode === "edit"
            ? products.find((product) => product.id === productModal.productId)
            : undefined;

    const planProduct = planModal
        ? products.find((product) => product.id === planModal.productId)
        : undefined;
    const editingPlan =
        planModal?.planId !== undefined
            ? planProduct?.plans.find((plan) => plan.id === planModal.planId)
            : undefined;

    const handleProductSubmit = async (value: ProductFormValue) => {
        const saved = await run(() =>
            productModal?.mode === "edit"
                ? updateProduct(storefront.slug, productModal.productId, value)
                : createProduct(storefront.slug, value),
        );
        if (saved) setProductModal(null);
        return saved;
    };

    const handlePlanSubmit = async (value: PlanInput) => {
        if (!planModal) return false;
        const { productId, planId } = planModal;

        const saved = await run(() =>
            planId === undefined
                ? createPlan(storefront.slug, productId, value)
                : updatePlan(storefront.slug, productId, planId, value),
        );
        if (saved) setPlanModal(null);
        return saved;
    };

    // The page belongs to the product, so it is renamed through the page
    // endpoint like any other page — only the control lives here.
    const handlePageRename = async (page: PageSummary, value: PageFormValue) => {
        const saved = await run(() => updatePage(storefront.slug, page.slug, value));
        if (saved) setRenamingPageId(null);
        return saved;
    };

    const handleProductDelete = async (product: Product) => {
        if (
            !window.confirm(
                `Delete "${product.name}"? Its page goes with it, and any block showing it will render empty. This can't be undone.`,
            )
        ) {
            return;
        }
        await run(() => deleteProduct(storefront.slug, product.id));
    };

    const handlePlanDelete = async (product: Product, plan: Plan) => {
        if (!window.confirm("Delete this plan? This can't be undone.")) return;
        await run(() => deletePlan(storefront.slug, product.id, plan.id));
    };

    return (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
            <div className="flex items-center justify-between">
                <Link
                    href={`/${storefront.slug}/settings`}
                    className="text-sm text-stone-600 hover:text-stone-950"
                >
                    ← Back to settings
                </Link>
                <h1 className="text-lg font-semibold text-stone-900">Products</h1>
            </div>

            <SettingsTabs storefrontSlug={storefront.slug} active="products" />

            {products.length === 0 ? (
                <p className="rounded-lg border border-dashed border-stone-300 px-4 py-8 text-center text-sm text-stone-500">
                    No products yet. Create one to place it on a page with a product block.
                </p>
            ) : (
                <ul className="flex flex-col divide-y divide-stone-200 rounded-lg border border-stone-200">
                    {products.map((product) => {
                        const page = pages.find((entry) => entry.product === product.id);
                        return (
                        <ProductRow
                            key={product.id}
                            product={product}
                            page={page}
                            storefrontSlug={storefront.slug}
                            currency={storefront.currency}
                            renamingPage={page !== undefined && renamingPageId === page.id}
                            onRenamePage={() => page && setRenamingPageId(page.id)}
                            onCancelRenamePage={() => setRenamingPageId(null)}
                            onSavePage={(value) =>
                                page ? handlePageRename(page, value) : Promise.resolve(false)
                            }
                            onError={setError}
                            pending={pending}
                            onEdit={() => setProductModal({ mode: "edit", productId: product.id })}
                            onDelete={() => handleProductDelete(product)}
                            onAddPlan={() => setPlanModal({ productId: product.id })}
                            onEditPlan={(plan) =>
                                setPlanModal({ productId: product.id, planId: plan.id })
                            }
                            onDeletePlan={(plan) => handlePlanDelete(product, plan)}
                        />
                        );
                    })}
                </ul>
            )}

            <Button onClick={() => setProductModal({ mode: "create" })} className="self-start">
                New product
            </Button>

            {error && (
                <p className="whitespace-pre-line rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                </p>
            )}

            {productModal && (
                <Modal
                    open
                    onClose={() => setProductModal(null)}
                    title={editingProduct ? `Edit ${editingProduct.name}` : "New product"}
                >
                    <ProductForm
                        // remount per target so the form seeds from the right
                        // product when switching rows
                        key={editingProduct?.id ?? "create"}
                        product={editingProduct}
                        pending={pending}
                        onSubmit={handleProductSubmit}
                        onError={setError}
                        onCancel={() => setProductModal(null)}
                    />
                </Modal>
            )}

            {planModal && planProduct && (
                <Modal
                    open
                    onClose={() => setPlanModal(null)}
                    title={editingPlan ? "Edit plan" : `Add a plan to ${planProduct.name}`}
                >
                    <PlanForm
                        key={editingPlan?.id ?? `create-${planProduct.id}`}
                        product={planProduct}
                        currency={storefront.currency}
                        plan={editingPlan}
                        pending={pending}
                        onSubmit={handlePlanSubmit}
                        onCancel={() => setPlanModal(null)}
                    />
                </Modal>
            )}
        </div>
    );
}
