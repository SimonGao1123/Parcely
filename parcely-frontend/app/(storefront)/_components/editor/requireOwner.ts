import { notFound } from "next/navigation";
import { getMe } from "@/lib/api/auth/getMe";
import { getStorefrontDetails } from "@/lib/api/storefront/getStorefrontDetails";
import type { Storefront } from "@/types/storefront";

// The backend's draft gate only hides *drafts*, so a published storefront's
// editor URLs are otherwise reachable by anyone. 404 rather than 403, matching
// how the backend hides storefronts a caller may not see.
//
// getStorefrontDetails is wrapped in React cache(), so a caller that also needs
// the storefront can just use the return value here rather than refetching.
export async function requireStorefrontOwner(storefrontSlug: string): Promise<Storefront> {
    const [storefront, me] = await Promise.all([getStorefrontDetails(storefrontSlug), getMe()]);

    if (!me || me.id !== storefront.owner.id) {
        notFound();
    }
    return storefront;
}
