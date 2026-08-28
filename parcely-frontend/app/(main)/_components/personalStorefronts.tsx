import { StorefrontListQuery } from "@/lib/api/storefront/getStorefrontList";
import StorefrontPagination from "./storefrontPagination";
import { getPersonalStorefronts } from "@/lib/api/storefront/getPersonalStorefronts";
import Link from "next/link";
import StorefrontCard from "./storefrontCard";
import StorefrontFilters from "./storefrontFilters";

export default async function PersonalStorefronts({ query }: { query: StorefrontListQuery }) {
    const { count, next, previous, results } = await getPersonalStorefronts(query);

    return (
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
            <h1 className="text-2xl font-semibold text-stone-900">My storefronts</h1>

            <StorefrontFilters />
            {results.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-16">
                    <p className="text-sm text-stone-500">You haven&apos;t created a storefront yet.</p>
                    <Link
                        href="/create_storefront"
                        className="rounded-lg bg-stone-800 px-4 py-2 text-sm text-stone-50 transition-colors hover:bg-stone-950"
                    >
                        Create your first storefront
                    </Link>
                </div>
            ) : (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {results.map((storefront) => (
                        <StorefrontCard key={storefront.id} storefront={storefront} />
                    ))}
                </div>
            )}

            <StorefrontPagination
                page={Number(query.page) || 1}
                count={count}
                hasNext={next !== null}
                hasPrevious={previous !== null}
            />
        </main>
    )
}