import type { MediaBlob } from "@/types/blob";
import type { PageSummary } from "@/types/page";
import type { FontFamily } from "@/types/style";
import type { PublicOwner } from "@/types/user";

// Storefront-wide: every product under it is priced in this currency.
export type Currency = "usd" | "eur" | "cad";

export type Theme =
    | "minimalist"
    | "professional"
    | "artist"
    | "contemporary"
    | "timeless";

// Unlike PageBlockStyle every key is required — this is the base layer blocks
// inherit from, so there is nothing above it to fall back to.
export type StorefrontStyle = {
    background_color: string;
    font_family: FontFamily;
    font_scale: number;
    font_color: string;
    line_spacing: number;
};

// Mirrors StoreFrontSummarySerializer — no pages array.
export type StorefrontSummary = {
    id: number;
    title: string;
    description: string | null;
    slug: string;
    theme: Theme;
    style: StorefrontStyle;
    currency: Currency;
    logo_image: MediaBlob | null;
    banner_image: MediaBlob | null;
    owner: PublicOwner;
    homepage: PageSummary | null;
    created_at: string;
    updated_at: string;
    is_draft: boolean;
};

// Mirrors StoreFrontSerializer.
export type Storefront = StorefrontSummary & {
    pages: PageSummary[];
};
