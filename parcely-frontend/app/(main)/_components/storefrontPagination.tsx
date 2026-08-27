'use client';

import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Props = {
    page: number;
    count: number;
    // DRF returns absolute backend URLs, so these are only useful as booleans
    hasNext: boolean;
    hasPrevious: boolean;
};

export default function StorefrontPagination({ page, count, hasNext, hasPrevious }: Props) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const go = (target: number) => {
        const params = new URLSearchParams(searchParams);
        if (target <= 1) params.delete("page");
        else params.set("page", String(target));
        router.push(`${pathname}?${params.toString()}`);
    };

    if (!hasNext && !hasPrevious) return null;

    const buttonClass =
        "cursor-pointer rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-700 transition-colors hover:border-stone-500 disabled:cursor-default disabled:opacity-40 disabled:hover:border-stone-300";

    return (
        <div className="flex items-center justify-center gap-4">
            <button type="button" onClick={() => go(page - 1)} disabled={!hasPrevious} className={buttonClass}>
                Previous
            </button>

            <span className="text-sm text-stone-600">
                Page {page} · {count} storefront{count === 1 ? "" : "s"}
            </span>

            <button type="button" onClick={() => go(page + 1)} disabled={!hasNext} className={buttonClass}>
                Next
            </button>
        </div>
    );
}
