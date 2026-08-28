'use client';

import { useEffect, useMemo, useRef } from "react";

type ImagePickerProps = {
    label: string;
    file: File | null;
    onChange: (file: File | null) => void;
    // the already-stored image, shown when no new file is staged (edit flow)
    existingUrl?: string | null;
};

export default function ImagePicker({ label, file, onChange, existingUrl }: ImagePickerProps) {
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
                    accept="image/*"
                    onChange={(e) => onChange(e.target.files?.[0] ?? null)}
                    className="text-sm text-stone-600 file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-stone-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:text-stone-700 hover:file:border-stone-500"
                />
                {file && (
                    <button
                        type="button"
                        onClick={() => {
                            // the input keeps its own value; without this reset
                            // re-picking the same file fires no change event
                            if (inputRef.current) inputRef.current.value = "";
                            onChange(null);
                        }}
                        className="cursor-pointer text-sm text-stone-500 underline hover:text-stone-800"
                    >
                        Clear
                    </button>
                )}
            </div>
        </div>
    );
}
