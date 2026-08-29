import type { MediaBlob } from "@/types/blob";
import type { PageBlock } from "@/types/block";

// Mirrors PageSummarySerializer — used for nav lists and create/update responses.
export type PageSummary = {
    id: number;
    title: string;
    slug: string;
    logo_image: MediaBlob | null;
    storefront: number;
    // the product this page was created for, null for a hand-made page. Product
    // pages are left out of storefront.pages entirely, so this only ever reads
    // non-null on a list fetched through getPages.
    product: number | null;
};

// Mirrors PageSerializer. `storefront` is a bare id — the nested serializer is
// commented out in store/serializers.py, so fetch the storefront separately.
export type Page = {
    id: number;
    title: string;
    slug: string;
    logo_image: MediaBlob | null;
    storefront: number;
    blocks: PageBlock[];
    created_at: string;
    updated_at: string;
    is_homepage: boolean;
    product: number | null;
};
