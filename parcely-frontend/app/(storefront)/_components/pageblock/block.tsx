import type { CSSProperties } from "react";
import type { PageBlock } from "@/types/block";
import { blockLayoutVars, blockStyleVars } from "./blockStyle";
import GalleryBlock from "./blocks/galleryBlock";
import LinkBlock from "./blocks/linkBlock";
import MediaBlock from "./blocks/mediaBlock";
import ProductBlock from "./blocks/productBlock";
import SlideshowBlock from "./blocks/slideshowBlock";
import TextBlock from "./blocks/textBlock";

// Dispatch happens in JSX rather than through a lookup map — resolving a
// component into a variable during render trips react-hooks/static-components.
// The switch also narrows the PageBlock union, so each branch gets the right
// resolved_content type without a cast.
function BlockContent({ block, storefrontSlug }: { block: PageBlock; storefrontSlug: string }) {
    switch (block.kind) {
        case "text":
            return <TextBlock block={block} />;
        case "media":
            return <MediaBlock block={block} />;
        case "gallery":
            return <GalleryBlock block={block} />;
        case "slideshow":
            return <SlideshowBlock block={block} />;
        case "product":
            return <ProductBlock block={block} />;
        case "link":
            return <LinkBlock block={block} storefrontSlug={storefrontSlug} />;
    }
}

export default function Block({
    block,
    storefrontSlug,
}: {
    block: PageBlock;
    storefrontSlug: string;
}) {
    const { alignment, padding } = block.style;

    const style: CSSProperties = {
        ...blockStyleVars(block.style),
        ...blockLayoutVars(block.layout),
        // schema defaults alignment to "left", but it is nullable, so a client
        // can persist an explicit null
        textAlign: alignment ?? "left",
        ...(padding !== null && { padding: `${padding}px` }),
        // first consumers of these two vars — styleVars has always set them and
        // nothing read them until now
        fontSize: "calc(1rem * var(--sf-font-scale))",
        lineHeight: "var(--sf-line)",
    };

    return (
        <div
            style={style}
            className="page-block bg-[var(--sf-bg)] font-[family-name:var(--sf-font)] text-[var(--sf-fg)]"
        >
            <BlockContent block={block} storefrontSlug={storefrontSlug} />
        </div>
    );
}
