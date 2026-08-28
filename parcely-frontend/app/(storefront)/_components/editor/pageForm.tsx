'use client';

import { useRef, useState } from "react";
import Button from "@/components/button";
import { useUploadFile } from "@/lib/api/s3/uploadFile";
import ImagePicker from "../storefront/form/imagePicker";

const inputClass =
    "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none";

// logo_image_id is omitted rather than nulled when nothing was touched, so the
// same payload works for create and for a PATCH that must leave the logo alone.
export type PageFormValue = {
    title: string;
    logo_image_id?: number | null;
};

export default function PageForm({
    initialTitle = "",
    existingLogoUrl,
    submitLabel,
    pending,
    onSubmit,
    onError,
    onCancel,
}: {
    initialTitle?: string;
    // absent for create; supplying it is also what reveals the Remove control
    existingLogoUrl?: string | null;
    submitLabel: string;
    pending: boolean;
    // resolves true when the caller accepted the value, which is the signal to
    // clear the form — the add form reuses one instance across many pages
    onSubmit: (value: PageFormValue) => Promise<boolean>;
    onError: (message: string) => void;
    onCancel?: () => void;
}) {
    const { upload, uploading } = useUploadFile();

    const [title, setTitle] = useState(initialTitle);
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoRemoved, setLogoRemoved] = useState(false);

    // confirmed blobs are permanent, so a failed submit must not upload a
    // second copy on retry
    const blobIds = useRef(new Map<File, number>());

    const reset = () => {
        setTitle("");
        setLogoFile(null);
        setLogoRemoved(false);
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const trimmed = title.trim();
        if (!trimmed) return;

        const value: PageFormValue = { title: trimmed };

        if (logoFile) {
            try {
                const cached = blobIds.current.get(logoFile);
                const id = cached ?? (await upload(logoFile));
                blobIds.current.set(logoFile, id);
                value.logo_image_id = id;
            } catch (uploadError) {
                onError(uploadError instanceof Error ? uploadError.message : String(uploadError));
                return;
            }
        } else if (logoRemoved) {
            value.logo_image_id = null;
        }

        if (await onSubmit(value)) reset();
    };

    const busy = pending || uploading;

    return (
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-3">
            <input
                type="text"
                value={title}
                maxLength={255}
                placeholder="Page title"
                onChange={(e) => setTitle(e.target.value)}
                className={inputClass}
            />

            <div className="flex items-end justify-between gap-4">
                <ImagePicker
                    label="Logo (optional)"
                    file={logoFile}
                    onChange={setLogoFile}
                    // forced to null once removed so the preview clears and the
                    // Remove control hides itself
                    existingUrl={logoRemoved ? null : existingLogoUrl}
                    onRemoveExisting={existingLogoUrl ? () => setLogoRemoved(true) : undefined}
                />

                <div className="flex items-center gap-3">
                    {onCancel && (
                        <Button variant="link" onClick={onCancel}>
                            Cancel
                        </Button>
                    )}
                    <Button type="submit" variant="outline" disabled={busy || !title.trim()}>
                        {uploading ? "Uploading…" : submitLabel}
                    </Button>
                </div>
            </div>
        </form>
    );
}
