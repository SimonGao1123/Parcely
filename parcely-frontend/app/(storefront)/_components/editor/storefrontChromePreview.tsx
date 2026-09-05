'use client';

import type { Storefront } from "@/types/storefront";
import { orderPages } from "../storefront/orderPages";
import { styleVars } from "../storefront/styleVars";
import { ThemedHeader, ThemedNavbar } from "../storefront/themed/registry";

// The edit route builds the same chrome on the server, which keeps AuthControl
// and CartLink out of its bundle. This one can't: it exists to track the theme
// and style still sitting in the settings form's state, so it renders here.
//
// A newly picked logo or banner only appears once saved — it has no url until
// it is uploaded. ImagePicker previews the staged file beside its own input, so
// it is not invisible in the meantime.
export default function StorefrontChromePreview({ storefront }: { storefront: Storefront }) {
    return (
        <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-stone-700">Preview</span>
            {/* Nothing inside is reachable — these are real nav links and a real
                sign-in button. */}
            <div
                aria-hidden
                className="overflow-hidden rounded-lg border border-stone-200 [&_*]:pointer-events-none"
                style={styleVars(storefront.style)}
            >
                {/* ThemedNavbar rather than StorefrontNavbar: the latter fixes
                    itself to the viewport and slides on scroll, which inside a
                    settings form would escape the box entirely. */}
                <ThemedNavbar
                    theme={storefront.theme}
                    storefront={storefront}
                    pages={orderPages(storefront)}
                    // 0 rather than a real count: this is the chrome a shopper
                    // sees, and a draft shows them no cart at all
                    cartCount={storefront.is_draft ? null : 0}
                />
                {/* Returns null for timeless and professional, which fold their
                    banner into the navbar instead. */}
                <ThemedHeader theme={storefront.theme} storefront={storefront} />
            </div>
        </div>
    );
}
