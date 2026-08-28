'use client';

import Image from "next/image";
import { useEffect, useMemo, useRef } from "react";
import Button from "@/components/button";
import type { MediaBlob } from "@/types/blob";

// Gallery and slideshow hold an ordered list of blob ids, so this is
// ImagePicker's shape widened to many files. The emitted order is stored-then-
// staged, which is the order the caller writes into gallery_ids/slideshow_ids.
export default function MediaListPicker({
    label,
    files,
    onChange,
    existing,
    onRemoveExisting,
}: {
    label: string;
    files: File[];
    onChange: (files: File[]) => void;
    // already-stored blobs, in their persisted order; empty in the create flow
    existing: MediaBlob[];
    onRemoveExisting: (id: number) => void;
}) {
    const inputRef = useRef<HTMLInputElement>(null);

    // Derived during render so previews are up on the first paint; the effect
    // exists only to revoke. Same pattern as ImagePicker, over an array.
    const objectUrls = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);

    useEffect(() => {
        return () => objectUrls.forEach((url) => URL.revokeObjectURL(url));
    }, [objectUrls]);

    const total = existing.length + files.length;

    return (
        <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-stone-700">
                {label} — {total} item{total === 1 ? "" : "s"}
            </span>

            {total > 0 && (
                <ul className="flex flex-wrap gap-2">
                    {existing.map((blob) => (
                        <li key={`blob-${blob.id}`} className="flex flex-col items-center gap-1">
                            {/* presigned urls expire, so they can't be optimized */}
                            <Image
                                src={blob.url}
                                alt=""
                                width={80}
                                height={64}
                                unoptimized
                                className="h-16 w-20 rounded border border-stone-200 object-cover"
                            />
                            <Button variant="link" onClick={() => onRemoveExisting(blob.id)}>
                                Remove
                            </Button>
                        </li>
                    ))}

                    {files.map((file, index) => (
                        <li key={`file-${index}-${file.name}`} className="flex flex-col items-center gap-1">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={objectUrls[index]}
                                alt=""
                                className="h-16 w-20 rounded border border-stone-200 object-cover"
                            />
                            <Button
                                variant="link"
                                onClick={() => onChange(files.filter((_, i) => i !== index))}
                            >
                                Clear
                            </Button>
                        </li>
                    ))}
                </ul>
            )}

            <input
                ref={inputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={(event) => {
                    onChange([...files, ...Array.from(event.target.files ?? [])]);
                    // appending rather than replacing, so the input has to be
                    // reset or re-picking the same file fires no change event
                    if (inputRef.current) inputRef.current.value = "";
                }}
                className="text-sm text-stone-600 file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-stone-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:text-stone-700 hover:file:border-stone-500"
            />
        </div>
    );
}
