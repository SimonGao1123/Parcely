'use client';

import Image from "next/image";
import Button from "@/components/button";
import type { PageSummary } from "@/types/page";

// A list of selectable rows rather than a <select>, for the same reason as the
// product picker: choosing where a link goes is a visual decision, and the whole
// set is already in memory from the route's fetch.
export default function PagePicker({
    pages,
    value,
    onChange,
}: {
    pages: PageSummary[];
    value: number | null;
    onChange: (pageId: number) => void;
}) {
    // The block's stored page_id is kept even when it no longer resolves, so that
    // saving an unrelated change re-sends the same id instead of silently
    // repointing the link. Mirrors the product picker's "Unavailable" row.
    const missing = value !== null && !pages.some((page) => page.id === value);

    return (
        <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-stone-700">Links to</span>

            {/* Capped and scrollable: the list is unpaginated, so a storefront
                with many product pages would push the modal past the viewport. */}
            <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-lg border border-stone-200 p-1">
                {missing && (
                    <li>
                        <span className="flex w-full items-center gap-3 rounded-lg border-2 border-sky-500 bg-sky-50 px-2 py-1.5 text-left">
                            <span className="size-10 rounded border border-dashed border-stone-300" />
                            <span className="flex-1 text-sm text-stone-500">
                                Unavailable (#{value})
                            </span>
                        </span>
                    </li>
                )}

                {pages.map((page) => (
                    <li key={page.id}>
                        <Button
                            variant="unstyled"
                            aria-pressed={value === page.id}
                            onClick={() => onChange(page.id)}
                            className={`flex w-full items-center gap-3 rounded-lg border-2 px-2 py-1.5 text-left ${
                                value === page.id
                                    ? "border-sky-500 bg-sky-50"
                                    : "border-transparent hover:bg-stone-50"
                            }`}
                        >
                            {/* presigned urls expire, so they can't be optimized */}
                            {page.logo_image ? (
                                <Image
                                    src={page.logo_image.url}
                                    alt=""
                                    width={40}
                                    height={40}
                                    unoptimized
                                    className="size-10 shrink-0 rounded object-contain"
                                />
                            ) : (
                                <span className="size-10 shrink-0 rounded border border-dashed border-stone-300" />
                            )}

                            <span className="flex flex-1 flex-col">
                                <span className="text-sm text-stone-900">{page.title}</span>
                                <span className="text-xs text-stone-500">/{page.slug}</span>
                            </span>

                            {page.product !== null && (
                                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold tracking-wider text-stone-600">
                                    PRODUCT
                                </span>
                            )}
                        </Button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
