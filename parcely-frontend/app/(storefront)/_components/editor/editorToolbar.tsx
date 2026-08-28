import Link from "next/link";
import type { SaveStatus } from "./useLayoutAutosave";

function StatusLabel({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
    switch (status) {
        case "saving":
            return <span className="text-stone-500">Saving…</span>;
        case "saved":
            return <span className="text-stone-500">Saved ✓</span>;
        case "error":
            return (
                <button type="button" onClick={onRetry} className="text-red-600 underline underline-offset-2">
                    Couldn&apos;t save ↺
                </button>
            );
        case "idle":
            return null;
    }
}

export default function EditorToolbar({
    storefrontSlug,
    title,
    status,
    onRetry,
}: {
    storefrontSlug: string;
    title: string;
    status: SaveStatus;
    onRetry: () => void;
}) {
    return (
        <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50 px-6 py-3 text-sm">
            {/* Settings, not the public page: it is the only route that fans out
                to the per-page block editors, so going back to the page would
                dead-end the flow. */}
            <Link href={`/${storefrontSlug}/settings`} className="text-stone-600 hover:text-stone-950">
                ← Back to settings
            </Link>
            <span className="font-medium text-stone-900">{title}</span>
            <StatusLabel status={status} onRetry={onRetry} />
        </div>
    );
}
