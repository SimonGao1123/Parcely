'use client';

import { useEffect, useMemo, useRef } from "react";
import Button from "@/components/button";

type ImagePickerProps = {
    label: string;
    file: File | null;
    onChange: (file: File | null) => void;
    // the already-stored image, shown when no new file is staged (edit flow)
    existingUrl?: string | null;
    // Edit flow only. `file: null` already means "nothing staged", which on a
    // PATCH is a different intent from "detach the stored image" — one omits
    // the id, the other sends null. Supplying this is what separates them, so
    // the create flow behaves exactly as before by leaving it out.
    onRemoveExisting?: () => void;
    // Storefront and page logos are images, but a media block renders video too
    // (BlobMedia branches on blob.kind), so that caller widens this.
    accept?: string;
};

export default function ImagePicker({
    label,
    file,
    onChange,
    existingUrl,
    onRemoveExisting,
    accept = "image/*",
}: ImagePickerProps) {
    const inputRef = useRef<HTMLInputElement>(null);

    // derived during render rather than set from an effect, so the preview is
    // available on the first paint; the effect exists only to revoke it
    const objectUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

    useEffect(() => {
        if (!objectUrl) return;
        return () => URL.revokeObjectURL(objectUrl);
    }, [objectUrl]);

    const preview = objectUrl ?? existingUrl ?? null;

    return (
        <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-stone-700">{label}</span>

            {preview && (
                // a plain img: next/image buys nothing for a blob: URL, which
                // cannot be optimized
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={preview}
                    alt=""
                    className="h-24 w-40 rounded-lg border border-stone-200 object-cover"
                />
            )}

            <div className="flex items-center gap-3">
                <input
                    ref={inputRef}
                    type="file"
                    accept={accept}
                    onChange={(e) => onChange(e.target.files?.[0] ?? null)}
                    className="text-sm text-stone-600 file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-stone-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:text-stone-700 hover:file:border-stone-500"
                />
                {file && (
                    <Button
                        variant="link"
                        onClick={() => {
                            // the input keeps its own value; without this reset
                            // re-picking the same file fires no change event
                            if (inputRef.current) inputRef.current.value = "";
                            onChange(null);
                        }}
                    >
                        Clear
                    </Button>
                )}
                {/* Detach only — the blob is deliberately left in S3. Nothing
                    checks whether a page block still references it by id. */}
                {onRemoveExisting && existingUrl && !file && (
                    <Button variant="link" onClick={onRemoveExisting}>
                        Remove
                    </Button>
                )}
            </div>
        </div>
    );
}
