import { apiFetch } from "@/lib/api.server";
import type { Me } from "@/types/user";

export async function getMe(): Promise<Me | null> {
    const response = await apiFetch("/accounts/me/");
    if (!response.ok) {
        return null;
    }
    return response.json();
}
