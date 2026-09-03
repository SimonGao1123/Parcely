'use client';

import Link from "next/link";
import { useRef, useState } from "react";
import Button from "@/components/button";
import { useUploadFile } from "@/lib/api/s3/uploadFile";
import { deleteStorefront } from "@/lib/api/storefront/deleteStorefront";
import { updateStorefront, type UpdateStorefrontInput } from "@/lib/api/storefront/updateStorefront";
import type { Currency, Storefront, StorefrontStyle, Theme } from "@/types/storefront";
import ImagePicker from "../storefront/form/imagePicker";
import StyleSelector from "../storefront/form/styleSelector";
import ThemeSelector from "../storefront/form/themeSelector";
import PageManager from "./pageManager";
import SettingsTabs from "./settingsTabs";

const inputClass =
    "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none";

const CURRENCIES: Currency[] = ["usd", "eur", "cad"];

export default function StorefrontSettings({ storefront }: { storefront: Storefront }) {
    const { upload, uploading } = useUploadFile();

    const [title, setTitle] = useState(storefront.title);
    const [description, setDescription] = useState(storefront.description ?? "");
    const [theme, setTheme] = useState<Theme>(storefront.theme);
    const [style, setStyle] = useState<StorefrontStyle>(storefront.style);
    const [currency, setCurrency] = useState<Currency>(storefront.currency);

    // A staged File and a "remove" flag are separate because on a PATCH the
    // absence of a new file is not the same instruction as detaching the old
    // one — one omits logo_image_id, the other sends null.
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [bannerFile, setBannerFile] = useState<File | null>(null);
    const [logoRemoved, setLogoRemoved] = useState(false);
    const [bannerRemoved, setBannerRemoved] = useState(false);

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Same reasoning as createStorefrontForm: confirmed blobs are permanent, so
    // a failed save must not upload a second copy on retry.
    const blobIds = useRef(new Map<File, number>());

    const uploadOnce = async (file: File) => {
        const cached = blobIds.current.get(file);
        if (cached !== undefined) return cached;

        const id = await upload(file);
        blobIds.current.set(file, id);
        return id;
    };

    // undefined means "leave this field alone" — the key is dropped from the
    // PATCH body entirely rather than sent as null.
    const resolveImage = async (file: File | null, removed: boolean) => {
        if (file) return uploadOnce(file);
        if (removed) return null;
        return undefined;
    };

    const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const trimmedTitle = title.trim();
        if (!trimmedTitle) {
            setError("Title is required.");
            return;
        }
        const trimmedDescription = description.trim() || null;

        setError(null);
        setSaving(true);

        const patch: UpdateStorefrontInput = {};
        if (trimmedTitle !== storefront.title) patch.title = trimmedTitle;
        if (trimmedDescription !== storefront.description) patch.description = trimmedDescription;
        if (theme !== storefront.theme) patch.theme = theme;
        if (currency !== storefront.currency) patch.currency = currency;
        if (JSON.stringify(style) !== JSON.stringify(storefront.style)) patch.style = style;

        try {
            const logo = await resolveImage(logoFile, logoRemoved);
            const banner = await resolveImage(bannerFile, bannerRemoved);
            if (logo !== undefined) patch.logo_image_id = logo;
            if (banner !== undefined) patch.banner_image_id = banner;
        } catch (uploadError) {
            setError(uploadError instanceof Error ? uploadError.message : String(uploadError));
            setSaving(false);
            return;
        }

        // deliberately outside the try: a title change makes the action redirect,
        // which it signals by throwing
        const result = await updateStorefront(storefront.slug, patch);

        if (result?.error) setError(result.error);
        setSaving(false);
    };

    const handlePublish = async () => {
        setError(null);
        setSaving(true);
        const result = await updateStorefront(storefront.slug, { is_draft: !storefront.is_draft });
        if (result?.error) setError(result.error);
        setSaving(false);
    };

    const handleDelete = async () => {
        if (!window.confirm(`Delete "${storefront.title}" and every page in it? This can't be undone.`)) {
            return;
        }
        setError(null);
        setSaving(true);
        const result = await deleteStorefront(storefront.slug);
        if (result?.error) setError(result.error);
        setSaving(false);
    };

    // homepage is nullable on the model, so there isn't always a page to go back to
    const backHref = storefront.homepage ? `/${storefront.slug}/${storefront.homepage.slug}` : "/personal";

    return (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-6 py-10">
            <div className="flex items-center justify-between">
                <Link href={backHref} className="text-sm text-stone-600 hover:text-stone-950">
                    ← Back to storefront
                </Link>
                <h1 className="text-lg font-semibold text-stone-900">Settings</h1>
            </div>

            <SettingsTabs storefrontSlug={storefront.slug} active="settings" />

            <form onSubmit={handleSave} className="flex flex-col gap-6">
                <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-stone-700">Title</span>
                    <input
                        type="text"
                        value={title}
                        maxLength={255}
                        onChange={(e) => setTitle(e.target.value)}
                        className={inputClass}
                    />
                    <span className="text-xs text-stone-500">
                        Renaming changes the storefront&apos;s URL — old links will stop working.
                    </span>
                </label>

                <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-stone-700">Description</span>
                    <textarea
                        value={description}
                        rows={3}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="What do you sell?"
                        className={inputClass}
                    />
                </label>

                <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-stone-700">Currency</span>
                    <div className="flex flex-wrap items-center gap-2">
                        {CURRENCIES.map((option) => (
                            <Button
                                key={option}
                                variant="chip"
                                active={currency === option}
                                onClick={() => setCurrency(option)}
                            >
                                {option.toUpperCase()}
                            </Button>
                        ))}
                    </div>
                    <span className="text-xs text-stone-500">
                        Every product in this storefront is priced in this currency.
                    </span>
                </div>

                <ThemeSelector value={theme} onChange={setTheme} />

                <StyleSelector value={style} onChange={setStyle} />

                <div className="flex flex-wrap gap-8">
                    {/* existingUrl is forced to null once removed, so the preview
                        clears immediately and the Remove control hides itself */}
                    <ImagePicker
                        label="Logo"
                        file={logoFile}
                        onChange={setLogoFile}
                        existingUrl={logoRemoved ? null : storefront.logo_image?.url}
                        onRemoveExisting={() => setLogoRemoved(true)}
                    />
                    <ImagePicker
                        label="Banner"
                        file={bannerFile}
                        onChange={setBannerFile}
                        existingUrl={bannerRemoved ? null : storefront.banner_image?.url}
                        onRemoveExisting={() => setBannerRemoved(true)}
                    />
                </div>

                <Button type="submit" disabled={saving} className="self-start">
                    {uploading ? "Uploading images…" : saving ? "Saving…" : "Save changes"}
                </Button>
            </form>

            <PageManager storefront={storefront} />

            <section className="flex flex-col gap-4 rounded-lg border border-stone-200 p-4">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-col">
                        <span className="text-sm font-medium text-stone-800">
                            {storefront.is_draft ? "Draft" : "Published"}
                        </span>
                        <span className="text-xs text-stone-500">
                            {storefront.is_draft
                                ? "Only you can see this storefront."
                                : "Anyone can find this storefront."}
                        </span>
                    </div>
                    <Button disabled={saving} onClick={handlePublish}>
                        {storefront.is_draft ? "Publish" : "Unpublish"}
                    </Button>
                </div>

                <div className="flex items-center justify-between gap-4 border-t border-stone-200 pt-4">
                    <span className="text-xs text-stone-500">
                        Deleting removes every page and block in this storefront.
                    </span>
                    <Button
                        variant="outline"
                        disabled={saving}
                        onClick={handleDelete}
                        className="border-red-300 text-red-700 hover:border-red-500"
                    >
                        Delete storefront
                    </Button>
                </div>
            </section>

            {error && (
                <p className="whitespace-pre-line rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                </p>
            )}
        </div>
    );
}
