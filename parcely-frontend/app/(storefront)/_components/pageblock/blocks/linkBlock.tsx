import Link from "next/link";
import type { LinkBlock as LinkBlockData } from "@/types/block";
import { objectPositionClass } from "./alignment";
import BlobMedia from "./blobMedia";

export default function LinkBlock({
    block,
    storefrontSlug,
}: {
    block: LinkBlockData;
    // the resolved page carries its own slug but not its storefront's, and a
    // page URL is /<storefront>/<page>
    storefrontSlug: string;
}) {
    const { page, media, text } = block.resolved_content;
    // null means the page was deleted or moved out of the storefront — the same
    // "the reference is gone" signal the media and product blocks render on
    if (!page) return null;

    return (
        <Link
            href={`/${storefrontSlug}/${page.slug}`}
            className="flex h-full w-full flex-col overflow-hidden"
        >
            {media && (
                // takes the leftover height so text, when present, keeps its own
                <BlobMedia
                    blob={media}
                    className={`min-h-0 w-full flex-1 object-cover ${objectPositionClass(block.style.alignment)}`}
                />
            )}
            {text && <span className="shrink-0 underline-offset-2 hover:underline">{text}</span>}
        </Link>
    );
}
