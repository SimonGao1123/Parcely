'use client';

// theme dependent, only loaded on detailed storefront view, used in a storefront layout file
import { useMemo } from "react";
import type { Storefront } from "@/types/storefront";
import { ThemedNavbar } from "./themed/registry";
import { useNavbarVisibility } from "@/components/useNavbarVisibility";
import { orderPages } from "./orderPages";
import { styleVars } from "./styleVars";

export default function StorefrontNavbar({ storefront }: { storefront: Storefront }) {
    const visible = useNavbarVisibility();

    const pages = useMemo(() => orderPages(storefront), [storefront]);

    return (
        <div
            style={styleVars(storefront.style)}
            // no `inert` while hidden — it would block focus-within, leaving the
            // nav permanently unreachable by keyboard after any scroll down
            className={`fixed inset-x-0 top-0 z-50 transition-transform duration-300 focus-within:translate-y-0 ${
                visible ? "translate-y-0" : "-translate-y-full"
            }`}
        >
            
            <ThemedNavbar theme={storefront.theme} storefront={storefront} pages={pages} />
        </div>
    );
}
