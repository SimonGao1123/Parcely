import Link from "next/link";
import type { Paginated } from "@/types/api";

// Previous / next over a DRF page. Renders nothing when everything fits on one.
export default function Pager({
    data,
    page,
    hrefFor,
}: {
    data: Paginated<unknown>;
    page: number;
    hrefFor: (page: number) => string;
}) {
    if (!data.next && !data.previous) return null;

    return (
        <div className="flex items-center justify-between text-sm">
            {data.previous ? (
                <Link href={hrefFor(page - 1)} className="underline opacity-70 hover:opacity-100">
                    ← Newer
                </Link>
            ) : (
                <span />
            )}
            {data.next && (
                <Link href={hrefFor(page + 1)} className="underline opacity-70 hover:opacity-100">
                    Older →
                </Link>
            )}
        </div>
    );
}

// ?page= as a number, defaulting to 1 for anything missing or malformed.
export function pageParam(value: string | string[] | undefined): number {
    const parsed = Number(Array.isArray(value) ? value[0] : value);
    return Number.isInteger(parsed) && parsed > 1 ? parsed : 1;
}
