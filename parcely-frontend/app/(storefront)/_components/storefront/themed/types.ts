import type { PageSummary } from "@/types/page";
import type { Storefront } from "@/types/storefront";

// Contract every theme file must satisfy. StorefrontNavbar owns positioning and
// reveal behaviour, so themed navbars render the bar contents only.
export type ThemedNavbarProps = {
    storefront: Storefront;
    pages: PageSummary[]; // pre-ordered — homepage first
};

export type ThemedHeaderProps = {
    storefront: Storefront;
};
