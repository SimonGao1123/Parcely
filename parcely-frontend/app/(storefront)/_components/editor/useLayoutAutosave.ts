import { useCallback, useEffect, useRef, useState } from "react";
import { updatePageLayout, type BlockLayoutUpdate } from "@/lib/api/page/updatePageLayout";
import type { PageBlock } from "@/types/block";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

const DEBOUNCE_MS = 800;

export function useLayoutAutosave(storefrontSlug: string, pageSlug: string, blocks: PageBlock[]) {
    const [status, setStatus] = useState<SaveStatus>("idle");

    // Every block is sent, not just moved ones. The payload is a few integers per
    // block and the endpoint treats a partial and a full list identically, so
    // tracking a dirty set would buy nothing.
    //
    // The payload travels as a JSON string because it doubles as the change
    // detector: a fresh array every render would re-fire the effect endlessly,
    // whereas the string is only unequal when a position actually changed.
    const serialized = JSON.stringify(blocks.map((block) => ({ id: block.id, layout: block.layout })));

    const pending = useRef(serialized);
    const lastSaved = useRef(serialized);
    // Monotonic id: a slow request resolving after a newer one must not report
    // its stale result.
    const requestId = useRef(0);

    const save = useCallback(async () => {
        const id = ++requestId.current;
        const body = pending.current;

        setStatus("saving");
        const result = await updatePageLayout(
            storefrontSlug,
            pageSlug,
            JSON.parse(body) as BlockLayoutUpdate[],
        );
        if (id !== requestId.current) return;

        if (result?.error) {
            setStatus("error");
            return;
        }
        lastSaved.current = body;
        setStatus("saved");
    }, [storefrontSlug, pageSlug]);

    useEffect(() => {
        pending.current = serialized;
        // also the initial-mount guard: opening the editor must not write
        if (serialized === lastSaved.current) return;

        const timer = setTimeout(save, DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [serialized, save]);

    return { status, retry: save };
}
