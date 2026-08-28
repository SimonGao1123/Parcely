'use server';

import { apiFetch } from "@/lib/api.server";
import type { PageBlockLayout } from "@/types/block";

export type BlockLayoutUpdate = {
    id: number;
    layout: PageBlockLayout;
};

function formatErrors(body: unknown): string {
    if (typeof body !== "object" || body === null) return "Failed to save layout.";
    const entries = Object.entries(body as Record<string, unknown>);
    if (entries.length === 0) return "Failed to save layout.";

    return entries
        .map(([field, messages]) => {
            const text = Array.isArray(messages) ? messages.join(" ") : String(messages);
            return field === "detail" ? text : `${field}: ${text}`;
        })
        .join("\n");
}

// One request for the whole batch: the backend validates overlap across the
// entire page, so sending these as separate per-block PATCHes would reject any
// rearrangement that passes through an overlapping intermediate state.
//
// Deliberately no revalidatePath — the editor's local state is the source of
// truth while editing, and revalidating would refetch the server tree underneath
// an in-progress drag. The public page is revalidated on leaving the editor.
export async function updatePageLayout(
    storefrontSlug: string,
    pageSlug: string,
    blocks: BlockLayoutUpdate[],
): Promise<{ error: string } | void> {
    const response = await apiFetch(
        `/storefronts/${storefrontSlug}/pages/${pageSlug}/blocks/layout/`,
        { method: "PATCH", body: JSON.stringify({ blocks }) },
    );

    if (!response.ok) {
        return { error: formatErrors(await response.json().catch(() => null)) };
    }
}
