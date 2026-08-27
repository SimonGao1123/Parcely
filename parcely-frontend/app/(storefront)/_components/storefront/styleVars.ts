import type { CSSProperties } from "react";
import type { StorefrontStyle } from "@/types/storefront";

// Themes read these vars instead of StorefrontStyle directly, so the mapping
// lives here once rather than in all five theme files.
export function styleVars(style: StorefrontStyle): CSSProperties {
    return {
        "--sf-bg": style.background_color,
        "--sf-fg": style.font_color,
        "--sf-font": style.font_family,
        "--sf-font-scale": style.font_scale,
        "--sf-line": style.line_spacing,
    } as CSSProperties;
}
