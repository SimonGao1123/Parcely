import { apiFetch } from "@/lib/api.server";
import type { Storefront } from "@/types/storefront";
import {cache} from "react";
import {notFound} from "next/navigation";

export const getStorefrontDetails = cache(async (storefrontSlug: string): Promise<Storefront> => {
    const response = await apiFetch(`/storefronts/${storefrontSlug}/details/`);
    if (!response.ok) {
        notFound();
    }
    
    return response.json();
});