import type { GalleryBlock as GalleryBlockData } from "@/types/block";
import BlobMedia from "./blobMedia";
import { isResolvedBlob } from "./resolved";

export default function GalleryBlock({ block }: { block: GalleryBlockData }) {
    const blobs = block.resolved_content.filter(isResolvedBlob);
    if (blobs.length === 0) return null;

    return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {blobs.map((blob) => (
                <BlobMedia
                    key={blob.id}
                    blob={blob}
                    className="aspect-square w-full object-cover"
                />
            ))}
        </div>
    );
}
