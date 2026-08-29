'use client';

import Image from "next/image";
import { useEffect, useMemo, useRef } from "react";
import Button from "@/components/button";
import type { MediaBlob } from "@/types/blob";

// An id already on the block. blob is null when it no longer resolves — the id
// is still carried so that saving doesn't quietly drop it, but there is nothing
// to show a preview of.
export type ExistingMedia = { id: number; blob: MediaBlob | null };

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
    // already-stored ids, in their persisted order; empty in the create flow
    existing: ExistingMedia[];
    // by index, since the same blob may appear more than once
    onRemoveExisting: (index: number) => void;
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
                    {existing.map((item, index) => (
                        <li key={`existing-${index}-${item.id}`} className="flex flex-col items-center gap-1">
                            {item.blob ? (
                                /* presigned urls expire, so they can't be optimized */
                                <Image
                                    src={item.blob.url}
                                    alt=""
                                    width={80}
                                    height={64}
                                    unoptimized
                                    className="h-16 w-20 rounded border border-stone-200 object-cover"
                                />
                            ) : (
                                <span className="flex h-16 w-20 items-center justify-center rounded border border-dashed border-stone-300 text-center text-[10px] text-stone-400">
                                    Unavailable
                                </span>
                            )}
                            <Button variant="link" onClick={() => onRemoveExisting(index)}>
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
