'use server';

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api.server";
import { errorFrom } from "@/lib/api/formatErrors";

// Pages cascade with the storefront (Page.storefront is on_delete=CASCADE), so
// there is nothing left to navigate back to.
export async function deleteStorefront(slug: string): Promise<{ error: string } | void> {
    const response = await apiFetch(`/storefronts/${slug}/delete/`, { method: "DELETE" });

    if (!response.ok) {
        return { error: await errorFrom(response, "Failed to delete storefront.") };
    }

    revalidatePath("/");
    revalidatePath("/personal");
    redirect("/personal");
}
