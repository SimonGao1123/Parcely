'use server';

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api.server";
import { errorFrom } from "@/lib/api/formatErrors";

// The homepage cannot be deleted: DeletePageAPIView.destroy returns
// 400 {"detail": "Cannot delete homepage"}. The UI hides the control, so
// reaching that response means the guard earned its keep — surface it rather
// than assuming a non-ok response is unreachable.
export async function deletePage(
    storefrontSlug: string,
    pageSlug: string,
): Promise<{ error: string } | void> {
    const response = await apiFetch(`/storefronts/${storefrontSlug}/pages/${pageSlug}/delete/`, {
        method: "DELETE",
    });

    if (!response.ok) {
        return { error: await errorFrom(response, "Failed to delete page.") };
    }

    revalidatePath(`/${storefrontSlug}`, "layout");
}
