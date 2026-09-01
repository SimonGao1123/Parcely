'use client';

// theme dependent, only loaded on detailed storefront view, used in a storefront layout file
import { useEffect, useMemo, useRef } from "react";
import type { Storefront } from "@/types/storefront";
import { ThemedNavbar } from "./themed/registry";
import { useNavbarVisibility } from "@/components/useNavbarVisibility";
import { orderPages } from "./orderPages";
import { styleVars } from "./styleVars";

export default function StorefrontNavbar({
    storefront,
    cartCount,
}: {
    storefront: Storefront;
    cartCount: number | null;
}) {
    const visible = useNavbarVisibility();

    const pages = useMemo(() => orderPages(storefront), [storefront]);
    const barRef = useRef<HTMLDivElement>(null);

    // The bar is fixed, so it reserves no space in flow and page content would
    // start underneath it. The layout offsets content by --sf-nav-h instead of a
    // hardcoded value: bar height varies by theme (timeless carries a 96px banner
    // strip, artist is a single padded row), varies again with the storefront's
    // logo size, and reflows when the links wrap on narrow viewports.
    useEffect(() => {
        const bar = barRef.current;
        if (!bar) return;

        const observer = new ResizeObserver(([entry]) => {
            document.documentElement.style.setProperty(
                "--sf-nav-h",
                `${entry.borderBoxSize[0].blockSize}px`,
            );
        });
        observer.observe(bar);
        return () => observer.disconnect();
    }, []);

    return (
        <div
            ref={barRef}
            style={styleVars(storefront.style)}
            // no `inert` while hidden — it would block focus-within, leaving the
            // nav permanently unreachable by keyboard after any scroll down
            className={`fixed inset-x-0 top-0 z-50 transition-transform duration-300 focus-within:translate-y-0 ${
                visible ? "translate-y-0" : "-translate-y-full"
            }`}
        >
            <ThemedNavbar
                theme={storefront.theme}
                storefront={storefront}
                pages={pages}
                cartCount={cartCount}
            />
        </div>
    );
}
