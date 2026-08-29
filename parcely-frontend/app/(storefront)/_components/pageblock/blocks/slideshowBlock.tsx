'use client';

import { useState } from "react";
import Button from "@/components/button";
import type { SlideshowBlock as SlideshowBlockData } from "@/types/block";
import { objectPositionClass } from "./alignment";
import BlobMedia from "./blobMedia";
import { isResolvedBlob } from "./resolved";

export default function SlideshowBlock({ block }: { block: SlideshowBlockData }) {
    const [index, setIndex] = useState(0);

    const blobs = block.resolved_content.filter(isResolvedBlob);
    if (blobs.length === 0) return null;

    // unresolved entries are dropped, so a stored index can outrun the list
    const current = index % blobs.length;
    const step = (delta: number) =>
        setIndex((i) => (i + delta + blobs.length) % blobs.length);

    return (
        <div className="relative h-full w-full overflow-hidden">
            <BlobMedia
                blob={blobs[current]}
                className={`h-full w-full object-cover ${objectPositionClass(block.style.alignment)}`}
            />

            {blobs.length > 1 && (
                <>
                    <Button
                        variant="unstyled"
                        aria-label="Previous slide"
                        onClick={() => step(-1)}
                        className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-black/40 px-3 py-1 text-white"
                    >
                        ‹
                    </Button>
                    <Button
                        variant="unstyled"
                        aria-label="Next slide"
                        onClick={() => step(1)}
                        className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-black/40 px-3 py-1 text-white"
                    >
                        ›
                    </Button>

                    <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
                        {blobs.map((blob, i) => (
                            <Button
                                key={blob.id}
                                variant="unstyled"
                                aria-label={`Go to slide ${i + 1}`}
                                onClick={() => setIndex(i)}
                                className={`size-2 rounded-full ${
                                    i === current ? "bg-white" : "bg-white/50"
                                }`}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
