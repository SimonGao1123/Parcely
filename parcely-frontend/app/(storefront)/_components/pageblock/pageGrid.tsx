import type { Page } from "@/types/page";
import type { Storefront } from "@/types/storefront";
import { styleVars } from "../storefront/styleVars";
import Block from "./block";

export default function PageGrid({ page, storefront }: { page: Page; storefront: Storefront }) {
    // Grid placement is explicit, so DOM order doesn't affect the visual result.
    // Sorting anyway keeps reading order aligned for keyboard and screen readers.
    const blocks = [...page.blocks].sort(
        (a, b) =>
            a.layout.desktop.row_start - b.layout.desktop.row_start ||
            a.layout.desktop.col_start - b.layout.desktop.col_start,
    );

    return (
        // styleVars here is load-bearing: blockStyleVars only emits overrides, so
        // the base --sf-* values have to exist on an ancestor. The navbar sets them
        // on a `fixed` wrapper and the header on a `display: contents` one, neither
        // of which is an ancestor of page content.
        //
        // containerType makes 100cqw resolve to this element's content width. It has
        // to be a separate element from the grid — nothing can resolve its own
        // container units — and it must stay padding-free, or cqw would no longer
        // match the width the columns actually occupy.
        <div
            style={{ ...styleVars(storefront.style), containerType: "inline-size" }}
            className="bg-[var(--sf-bg)] text-[var(--sf-fg)]"
        >
            {/* Cells are exactly square: 12 equal columns at zero gap makes a column
                100cqw/12 wide, and the row track is pinned to that same value. A fixed
                row track is also what stops content from growing the grid. */}
            <div className="grid grid-cols-12" style={{ gridAutoRows: "calc(100cqw / 12)" }}>
                {blocks.map((block) => (
                    <Block key={block.id} block={block} />
                ))}
            </div>
        </div>
    );
}
