import type { CSSProperties } from "react";
import type { BlockPosition, PageBlockLayout, PageBlockStyle } from "@/types/block";

// Block styles are overrides of the storefront style. A null key must be OMITTED
// rather than emitted as null — omitting it lets the ancestor's --sf-* value
// inherit down, which is the entire inheritance mechanism.
export function blockStyleVars(style: PageBlockStyle): CSSProperties {
    return {
        ...(style.background_color !== null && { "--sf-bg": style.background_color }),
        ...(style.font_color !== null && { "--sf-fg": style.font_color }),
        ...(style.font_family !== null && { "--sf-font": style.font_family }),
        ...(style.font_scale !== null && { "--sf-font-scale": style.font_scale }),
        ...(style.line_spacing !== null && { "--sf-line": style.line_spacing }),
    } as CSSProperties;
}

function positionVars(position: BlockPosition, suffix: string): Record<string, number> {
    return {
        [`--blk-row-start${suffix}`]: position.row_start,
        [`--blk-row-span${suffix}`]: position.row_span,
        [`--blk-col-start${suffix}`]: position.col_start,
        [`--blk-col-span${suffix}`]: position.col_span,
    };
}

// Consumed by the .page-block rules in globals.css. Tablet and mobile vars are
// only emitted when present, so the fallback in the media query picks up desktop.
export function blockLayoutVars(layout: PageBlockLayout): CSSProperties {
    return {
        ...positionVars(layout.desktop, ""),
        ...(layout.tablet && positionVars(layout.tablet, "-tablet")),
        ...(layout.mobile && positionVars(layout.mobile, "-mobile")),
    } as CSSProperties;
}
