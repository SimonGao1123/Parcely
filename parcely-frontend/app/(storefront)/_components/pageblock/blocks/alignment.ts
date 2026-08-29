import type { Alignment } from "@/types/style";

// text-align only moves inline content, so it reaches TextBlock but does nothing
// for the media kinds: gallery lays out with a grid/flex container and the
// single-media kinds fill their block outright. These map the same stored value
// onto the property each layout actually responds to.
//
// Full class strings, never interpolated fragments — Tailwind scans source text
// and would not emit a class assembled at runtime.

const JUSTIFY: Record<Alignment, string> = {
    left: "justify-start",
    center: "justify-center",
    right: "justify-end",
};

const OBJECT_POSITION: Record<Alignment, string> = {
    left: "object-left",
    center: "object-center",
    right: "object-right",
};

// alignment is typed non-null but the API allows an explicit null, matching the
// `alignment ?? "left"` fallback in block.tsx
export function justifyClass(alignment: Alignment | null): string {
    return JUSTIFY[alignment ?? "left"];
}

// For media that fills its block: object-cover crops, so alignment chooses which
// edge of the image survives rather than where the image sits.
export function objectPositionClass(alignment: Alignment | null): string {
    return OBJECT_POSITION[alignment ?? "left"];
}
