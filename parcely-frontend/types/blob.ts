export type BlobKind = "image" | "video";

export type ImageMetadata = {
    width: number;
    height: number;
};

export type VideoMetadata = {
    duration: number;
    width: number;
    height: number;
};

export type BlobMetadata = ImageMetadata | VideoMetadata;

// Named MediaBlob rather than Blob so it doesn't shadow the DOM Blob global.
// `url` is a presigned S3 link and expires — don't cache it past a page load.
export type MediaBlob = {
    id: number;
    url: string;
    kind: BlobKind;
    metadata: BlobMetadata;
};
