// No 'use client': the header is static, so unlike StorefrontNavbar it has no
// reason to ship to the browser.

import type { Storefront } from "@/types/storefront";
import { ThemedHeader } from "./themed/registry";
import { styleVars } from "./styleVars";

export default function StorefrontHeader({ storefront }: { storefront: Storefront }) {
    return (
        // its own --sf-* scope: StorefrontNavbar's vars live on a `fixed` wrapper
        // that is not an ancestor of anything rendered from the page.
        // display:contents so the wrapper generates no box — timeless and
        // professional render no header, and an empty div would still eat a gap
        // slot in a flex parent. Custom properties inherit through it regardless.
        <div style={{ ...styleVars(storefront.style), display: "contents" }}>
            <ThemedHeader theme={storefront.theme} storefront={storefront} />
        </div>
    );
}
