import type { PageSummary } from "@/types/page";
import type { Storefront } from "@/types/storefront";

// Page has no ordering column yet, so the homepage is pinned to the front and
// the rest keep the order the API returned. ThemedNavbarProps documents `pages`
// as pre-ordered, so every caller has to run this first.
export function orderPages(storefront: Storefront): PageSummary[] {
    const homepageId = storefront.homepage?.id;
    if (homepageId == null) return storefront.pages;

    const homepage = storefront.pages.find((page) => page.id === homepageId);
    if (!homepage) return storefront.pages;

    return [homepage, ...storefront.pages.filter((page) => page.id !== homepageId)];
}
