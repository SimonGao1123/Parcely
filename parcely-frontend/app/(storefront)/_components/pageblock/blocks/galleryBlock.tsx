import type { GalleryBlock as GalleryBlockData } from "@/types/block";
import { justifyClass } from "./alignment";
import BlobMedia from "./blobMedia";
import { isResolvedBlob } from "./resolved";

export default function GalleryBlock({ block }: { block: GalleryBlockData }) {
    const blobs = block.resolved_content.filter(isResolvedBlob);
    if (blobs.length === 0) return null;

    return (
        // flex-wrap rather than the previous `fr` grid: fr tracks always consume
        // the whole row, so a partial row leaves no free space for
        // justify-content to distribute and two images could never move off the
        // left edge. The widths subtract the gaps their row carries — one gap
        // across two columns, two across three.
        <div className={`flex flex-wrap gap-2 ${justifyClass(block.style.alignment)}`}>
            {blobs.map((blob) => (
                <BlobMedia
                    key={blob.id}
                    blob={blob}
                    className="aspect-square w-[calc((100%-0.5rem)/2)] object-cover sm:w-[calc((100%-1rem)/3)]"
                />
            ))}
        </div>
    );
}
