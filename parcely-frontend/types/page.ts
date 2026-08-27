import type { MediaBlob } from "@/types/blob";
import type { PageBlock } from "@/types/block";
import type { StorefrontSummary } from "@/types/storefront";

// Mirrors PageSummarySerializer — used for nav lists and create/update responses.
export type PageSummary = {
    id: number;
    title: string;
    slug: string;
    logo_image: MediaBlob | null;
    storefront: number;
};

// Mirrors PageSerializer — nests the storefront rather than exposing storefront_id.
export type Page = {
    id: number;
    title: string;
    slug: string;
    logo_image: MediaBlob | null;
    storefront: StorefrontSummary;
    blocks: PageBlock[];
    created_at: string;
    updated_at: string;
};
