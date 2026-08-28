// DRF hands back either {"detail": "..."} or {"field": ["msg", ...]}.
export function formatErrors(body: unknown, fallback: string): string {
    if (typeof body !== "object" || body === null) return fallback;
    const entries = Object.entries(body as Record<string, unknown>);
    if (entries.length === 0) return fallback;

    return entries
        .map(([field, messages]) => {
            const text = Array.isArray(messages) ? messages.join(" ") : String(messages);
            return field === "detail" ? text : `${field}: ${text}`;
        })
        .join("\n");
}

// Response bodies are consumed at most once and an error response may have none
// at all (204, or a proxy's HTML), so every caller needs the same guard.
export async function errorFrom(response: Response, fallback: string): Promise<string> {
    return formatErrors(await response.json().catch(() => null), fallback);
}
