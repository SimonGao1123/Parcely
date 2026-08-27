'use client';

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Theme } from "@/types/storefront";

const THEMES: Theme[] = [
    "minimalist",
    "professional",
    "artist",
    "contemporary",
    "timeless",
];

export default function StorefrontFilters() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const activeTheme = searchParams.get("theme") ?? "";
    const activeOrder = searchParams.get("order") ?? "-created";
    const activeTitle = searchParams.get("title") ?? "";

    const apply = (changes: Record<string, string | null>) => {
        const params = new URLSearchParams(searchParams);
        for (const [key, value] of Object.entries(changes)) {
            if (value) params.set(key, value);
            else params.delete(key);
        }
        // a changed filter invalidates the current page number
        params.delete("page");
        router.push(`${pathname}?${params.toString()}`);
    };

    return (
        <div className="flex flex-col gap-4">
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    const value = new FormData(e.currentTarget).get("title");
                    apply({ title: typeof value === "string" ? value.trim() : null });
                }}
            >
                <input
                    name="title"
                    type="search"
                    // remount on external URL changes so the box reflects the query
                    key={activeTitle}
                    defaultValue={activeTitle}
                    placeholder="Search storefronts"
                    className="w-full max-w-sm rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none"
                />
            </form>

            <div className="flex flex-wrap items-center gap-2">
                {THEMES.map((theme) => {
                    const active = activeTheme === theme;
                    return (
                        <button
                            key={theme}
                            type="button"
                            // clicking the active theme clears the filter
                            onClick={() => apply({ theme: active ? null : theme })}
                            className={`cursor-pointer rounded-full border px-3 py-1 text-sm capitalize transition-colors ${
                                active
                                    ? "border-stone-800 bg-stone-800 text-stone-50"
                                    : "border-stone-300 text-stone-700 hover:border-stone-500"
                            }`}
                        >
                            {theme}
                        </button>
                    );
                })}

                <select
                    value={activeOrder}
                    onChange={(e) => apply({ order: e.target.value })}
                    className="ml-auto cursor-pointer rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 focus:outline-none"
                >
                    <option value="-created">Newest first</option>
                    <option value="created">Oldest first</option>
                </select>
            </div>
        </div>
    );
}
