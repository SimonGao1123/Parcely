import Image from "next/image";
import type { MediaBlob } from "@/types/blob";

// Shared by the media, gallery and slideshow blocks — all three render a blob
// that may be either an image or a video.
export default function BlobMedia({ blob, className }: { blob: MediaBlob; className?: string }) {
    if (blob.kind === "video") {
        return <video src={blob.url} controls className={className} />;
    }

    return (
        // presigned urls expire, so they can't be optimized
        <Image
            src={blob.url}
            alt=""
            width={blob.metadata.width}
            height={blob.metadata.height}
            unoptimized
            className={className}
        />
    );
}
