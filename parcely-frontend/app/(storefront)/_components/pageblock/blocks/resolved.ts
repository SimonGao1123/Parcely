import type { MediaBlob } from "@/types/blob";

// Gallery and slideshow keep unresolvable entries in place as their raw id, so
// the array lines up index-for-index with content.*_ids. Rendering skips them.
export function isResolvedBlob(entry: MediaBlob | number): entry is MediaBlob {
    return typeof entry !== "number";
}
