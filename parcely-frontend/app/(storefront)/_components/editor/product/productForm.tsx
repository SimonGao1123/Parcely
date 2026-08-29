'use client';

import { useRef, useState } from "react";
import Button from "@/components/button";
import { useUploadFile } from "@/lib/api/s3/uploadFile";
import type { Currency, Product } from "@/types/product";
import ImagePicker from "../../storefront/form/imagePicker";

// Shared with planForm — the two sit side by side in the same modal stack and
// their inputs have to match.
export const INPUT_CLASS =
    "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none";

const CURRENCIES: Currency[] = ["usd", "eur", "cad"];

// Structurally satisfies both CreateProductInput and UpdateProductInput; the
// caller picks which action to hand it to.
export type ProductFormValue = {
    name: string;
    description: string;
    currency: Currency;
    is_subscription: boolean;
    is_active: boolean;
    max_capacity: number | null;
    display_image_id?: number | null;
};

export default function ProductForm({
    product,
    pending,
    onSubmit,
    onError,
    onCancel,
}: {
    // absent in the create flow
    product?: Product;
    pending: boolean;
    // resolves true when the caller accepted it, which is what closes the modal
    onSubmit: (value: ProductFormValue) => Promise<boolean>;
    onError: (message: string) => void;
    onCancel: () => void;
}) {
    const { upload, uploading } = useUploadFile();

    const [name, setName] = useState(product?.name ?? "");
    const [description, setDescription] = useState(product?.description ?? "");
    const [currency, setCurrency] = useState<Currency>(product?.currency ?? "usd");
    const [isSubscription, setIsSubscription] = useState(product?.is_subscription ?? true);
    const [isActive, setIsActive] = useState(product?.is_active ?? true);
    const [capacity, setCapacity] = useState(product?.max_capacity?.toString() ?? "");

    // A staged File and a "remove" flag are separate because on a PATCH the
    // absence of a new file is not the same instruction as detaching the old
    // one. Same split as storefrontSettings.
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imageRemoved, setImageRemoved] = useState(false);

    // Confirmed blobs are permanent, so a failed submit must not upload a
    // second copy on retry.
    const blobIds = useRef(new Map<File, number>());

    const uploadOnce = async (file: File) => {
        const cached = blobIds.current.get(file);
        if (cached !== undefined) return cached;
        const id = await upload(file);
        blobIds.current.set(file, id);
        return id;
    };

    // undefined means "leave this field alone" — the key is dropped entirely
    // rather than sent as null.
    const resolveImage = async () => {
        if (imageFile) return uploadOnce(imageFile);
        if (imageRemoved) return null;
        return undefined;
    };

    // Once a product has plans its subscription flag is frozen: Plan.clean()
    // validates against it, so flipping it would strand every existing plan in
    // a state it can never be re-saved past. The backend rejects it too, but
    // that 400 is a backstop rather than the interaction.
    const planCount = product?.plans.length ?? 0;
    const kindLocked = planCount > 0;

    const canSubmit = name.trim().length > 0 && description.trim().length > 0;
    const busy = pending || uploading;

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!canSubmit) return;

        const value: ProductFormValue = {
            name: name.trim(),
            description: description.trim(),
            currency,
            is_subscription: isSubscription,
            is_active: isActive,
            // Always sent, never omitted. Switching an existing product to
            // one-time has to clear a capacity it already has, or clean()
            // rejects the save for a value the form is no longer showing.
            max_capacity: isSubscription && capacity.trim() ? Number(capacity) : null,
        };

        try {
            const image = await resolveImage();
            if (image !== undefined) value.display_image_id = image;
        } catch (uploadError) {
            onError(uploadError instanceof Error ? uploadError.message : String(uploadError));
            return;
        }

        await onSubmit(value);
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-stone-700">Name</span>
                <input
                    type="text"
                    value={name}
                    maxLength={255}
                    onChange={(e) => setName(e.target.value)}
                    className={INPUT_CLASS}
                />
            </label>

            <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-stone-700">Description</span>
                <textarea
                    value={description}
                    rows={3}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What is this?"
                    className={INPUT_CLASS}
                />
            </label>

            <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-stone-700">Billing</span>
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        variant="chip"
                        active={isSubscription}
                        disabled={kindLocked}
                        onClick={() => setIsSubscription(true)}
                    >
                        Subscription
                    </Button>
                    <Button
                        variant="chip"
                        active={!isSubscription}
                        disabled={kindLocked}
                        onClick={() => setIsSubscription(false)}
                    >
                        One-time
                    </Button>
                </div>
                {kindLocked && (
                    <span className="text-xs text-stone-500">
                        Delete this product&apos;s {planCount === 1 ? "plan" : "plans"} to change this.
                    </span>
                )}
            </div>

            <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-stone-700">Currency</span>
                <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as Currency)}
                    className={INPUT_CLASS}
                >
                    {CURRENCIES.map((option) => (
                        <option key={option} value={option}>
                            {option.toUpperCase()}
                        </option>
                    ))}
                </select>
            </label>

            {/* Subscriptions only — the model rejects a capacity on a one-time
                product outright. */}
            {isSubscription && (
                <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-stone-700">Max subscribers</span>
                    <input
                        type="number"
                        min={1}
                        value={capacity}
                        onChange={(e) => setCapacity(e.target.value)}
                        placeholder="Unlimited"
                        className={INPUT_CLASS}
                    />
                </label>
            )}

            <label className="flex items-center gap-2">
                <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="size-4"
                />
                <span className="text-sm text-stone-700">Active</span>
            </label>

            {/* Images only: Product.clean() rejects a display_image whose mime
                isn't image/*. */}
            <ImagePicker
                label="Display image"
                file={imageFile}
                onChange={setImageFile}
                existingUrl={imageRemoved ? null : product?.display_image?.url}
                onRemoveExisting={product ? () => setImageRemoved(true) : undefined}
            />

            <div className="flex items-center justify-end gap-3 border-t border-stone-200 pt-4">
                <Button variant="link" onClick={onCancel}>
                    Cancel
                </Button>
                <Button type="submit" disabled={busy || !canSubmit}>
                    {uploading ? "Uploading…" : product ? "Save" : "Create product"}
                </Button>
            </div>
        </form>
    );
}
