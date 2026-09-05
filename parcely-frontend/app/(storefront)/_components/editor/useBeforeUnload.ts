import { useEffect } from "react";

// Catches the ways out of the page that aren't a client-side navigation:
// refresh, tab close, and typing a new URL. Browsers show their own wording and
// ignore any message we supply, so there is nothing to customise here — only
// preventDefault decides whether the prompt appears at all.
export function useBeforeUnload(enabled: boolean) {
    useEffect(() => {
        if (!enabled) return;

        const handler = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [enabled]);
}
