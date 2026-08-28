import { apiFetch } from "@/lib/api.server";
export async function getMe() {
    const response = await apiFetch("/accounts/me/");
    if (!response.ok) {
        return null;
    }
    return response.json();
}