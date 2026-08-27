import { getStorefrontList, type StorefrontListQuery } from "@/lib/api/storefront/getStorefrontList";
import StorefrontCard from "./storefrontCard";
import StorefrontFilters from "./storefrontFilters";
import StorefrontPagination from "./storefrontPagination";

export default async function Homepage({ query }: { query: StorefrontListQuery }) {
    const { count, next, previous, results } = await getStorefrontList(query);
    const page = Number(query.page) || 1;

    return (
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
            <StorefrontFilters />

            {results.length === 0 ? (
                <p className="py-16 text-center text-sm text-stone-500">
                    No storefronts match those filters.
                </p>
            ) : (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {results.map((storefront) => (
                        <StorefrontCard key={storefront.id} storefront={storefront} />
                    ))}
                </div>
            )}

            <StorefrontPagination
                page={page}
                count={count}
                hasNext={next !== null}
                hasPrevious={previous !== null}
            />
        </main>
    );
}
