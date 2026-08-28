'use client';

import { useRef, useState } from "react";
import { useUploadFile } from "@/lib/api/s3/uploadFile";
import { createStorefront } from "@/lib/api/storefront/createStorefront";
import type { StorefrontStyle, Theme } from "@/types/storefront";
import ImagePicker from "./form/imagePicker";
import StyleSelector, { DEFAULT_STOREFRONT_STYLE } from "./form/styleSelector";
import ThemeSelector from "./form/themeSelector";

const inputClass =
    "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none";

export default function CreateStorefrontForm() {
    const { upload, uploading } = useUploadFile();

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [theme, setTheme] = useState<Theme>("minimalist");
    const [style, setStyle] = useState<StorefrontStyle>(DEFAULT_STOREFRONT_STYLE);
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [bannerFile, setBannerFile] = useState<File | null>(null);

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Confirmed blobs are permanent, so a failed submit must not re-upload on
    // retry — that would abandon a copy in S3 with nothing to reap it. Keying by
    // the File itself means picking a different file misses the cache naturally.
    const blobIds = useRef(new Map<File, number>());

    const uploadOnce = async (file: File | null) => {
        if (!file) return null;
        const cached = blobIds.current.get(file);
        if (cached !== undefined) return cached;

        const id = await upload(file);
        blobIds.current.set(file, id);
        return id;
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const trimmed = title.trim();
        if (!trimmed) {
            setError("Title is required.");
            return;
        }

        setError(null);
        setSubmitting(true);

        let logo_image_id: number | null;
        let banner_image_id: number | null;
        try {
            logo_image_id = await uploadOnce(logoFile);
            banner_image_id = await uploadOnce(bannerFile);
        } catch (uploadError) {
            setError(uploadError instanceof Error ? uploadError.message : String(uploadError));
            setSubmitting(false);
            return;
        }

        // deliberately outside the try: the action signals success by throwing
        // a redirect, which a catch would swallow
        const result = await createStorefront({
            title: trimmed,
            description: description.trim() || null,
            theme,
            style,
            logo_image_id,
            banner_image_id,
        });

        if (result?.error) setError(result.error);
        setSubmitting(false);
    };

    return (
        <form onSubmit={handleSubmit} className="flex w-full max-w-2xl flex-col gap-6">
            <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-stone-700">Title</span>
                <input
                    type="text"
                    value={title}
                    maxLength={255}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="My storefront"
                    className={inputClass}
                />
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

            <ThemeSelector value={theme} onChange={setTheme} />

            <StyleSelector value={style} onChange={setStyle} />

            <div className="flex flex-wrap gap-8">
                <ImagePicker label="Logo" file={logoFile} onChange={setLogoFile} />
                <ImagePicker label="Banner" file={bannerFile} onChange={setBannerFile} />
            </div>

            {error && (
                <p className="whitespace-pre-line rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                </p>
            )}

            <button
                type="submit"
                disabled={submitting}
                className="cursor-pointer self-start rounded-lg bg-stone-800 px-4 py-2 text-sm text-stone-50 transition-colors hover:bg-stone-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {submitting ? "Creating…" : uploading ? "Uploading images..." : "Create storefront"}
            </button>
        </form>
    );
}
