import { apiFetch } from "@/lib/api.server";
import type { Page } from "@/types/page";

export async function getPage(storefrontSlug: string, pageSlug: string): Promise<Page> {
    const res = await apiFetch(`/storefronts/${storefrontSlug}/pages/${pageSlug}/details/`)
    if (!res.ok) {
        throw new Error("Failed to get page");
    }
    return res.json();
}