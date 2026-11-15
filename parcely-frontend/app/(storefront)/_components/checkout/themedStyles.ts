// The storefront's own colours for the checkout surfaces, which sit on themed
// pages. Same treatment as AddToCartButton, so every primary action on a
// storefront looks like the same button.
export const PRIMARY_CLASS = "rounded-lg px-4 py-2.5 text-sm font-medium";
export const PRIMARY_STYLE = { background: "var(--sf-fg)", color: "var(--sf-bg)" } as const;
export const INPUT_CLASS =
    "w-full rounded-lg border border-[var(--sf-fg)]/40 bg-transparent px-3 py-2 text-sm focus:border-[var(--sf-fg)] focus:outline-none disabled:opacity-60";
