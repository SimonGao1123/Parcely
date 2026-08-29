import type { MediaBlock as MediaBlockData } from "@/types/block";
import { objectPositionClass } from "./alignment";
import BlobMedia from "./blobMedia";

export default function MediaBlock({ block }: { block: MediaBlockData }) {
    const blob = block.resolved_content;
    // null means the blob was deleted or moved out of the storefront — the
    // serializer resolves it against the storefront, not just the id
    if (!blob) return null;

    return (
        <BlobMedia
            blob={blob}
            className={`h-full w-full object-cover ${objectPositionClass(block.style.alignment)}`}
        />
    );
}
