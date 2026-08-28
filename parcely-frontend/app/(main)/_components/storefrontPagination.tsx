'use client';

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Button from "@/components/button";

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

    return (
        <div className="flex items-center justify-center gap-4">
            <Button variant="outline" onClick={() => go(page - 1)} disabled={!hasPrevious}>
                Previous
            </Button>

            <span className="text-sm text-stone-600">
                Page {page} · {count} storefront{count === 1 ? "" : "s"}
            </span>

            <Button variant="outline" onClick={() => go(page + 1)} disabled={!hasNext}>
                Next
            </Button>
        </div>
    );
}
