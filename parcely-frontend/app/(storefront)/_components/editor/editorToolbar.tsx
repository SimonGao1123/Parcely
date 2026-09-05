'use client';

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/button";
import Modal from "./modal";
import type { SaveStatus } from "./usePageSave";

function StatusLabel({ status, dirty }: { status: SaveStatus; dirty: boolean }) {
    if (status === "uploading") return <span className="text-stone-500">Uploading…</span>;
    if (status === "saving") return <span className="text-stone-500">Saving…</span>;
    // Outranks "saved", and covers "error" too: a failed save rebaselines
    // nothing, so the page is still dirty and the toast carries the reason.
    if (dirty) return <span className="text-amber-700">Unsaved changes</span>;
    if (status === "saved") return <span className="text-stone-500">Saved ✓</span>;
    return null;
}

export default function EditorToolbar({
    storefrontSlug,
    title,
    status,
    dirty,
    saving,
    onSave,
}: {
    storefrontSlug: string;
    title: string;
    status: SaveStatus;
    dirty: boolean;
    saving: boolean;
    onSave: () => void;
}) {
    const router = useRouter();
    const [confirmLeave, setConfirmLeave] = useState(false);

    // Settings, not the public page: it is the only route that fans out to the
    // per-page block editors, so going back to the page would dead-end the flow.
    const back = `/${storefrontSlug}/settings`;

    return (
        <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50 px-6 py-3 text-sm">
            <Link
                href={back}
                // onNavigate rather than onClick: it only fires for the
                // client-side navigation itself, so Cmd+click and "open in new
                // tab" still work and are not worth guarding anyway.
                onNavigate={(event) => {
                    if (!dirty) return;
                    event.preventDefault();
                    setConfirmLeave(true);
                }}
                className="text-stone-600 hover:text-stone-950"
            >
                ← Back to settings
            </Link>

            <span className="font-medium text-stone-900">{title}</span>

            <div className="flex items-center gap-3">
                <StatusLabel status={status} dirty={dirty} />
                <Button onClick={onSave} disabled={!dirty || saving}>
                    {saving ? "Saving…" : "Save"}
                </Button>
            </div>

            <Modal
                open={confirmLeave}
                onClose={() => setConfirmLeave(false)}
                title="Leave without saving?"
            >
                <div className="flex flex-col gap-4">
                    <p className="text-sm text-stone-600">
                        Your changes to this page haven&apos;t been saved. Leaving now discards
                        them.
                    </p>
                    <div className="flex justify-end gap-3">
                        <Button variant="link" onClick={() => setConfirmLeave(false)}>
                            Stay
                        </Button>
                        {/* router.push rather than letting the Link through: it
                            doesn't run onNavigate, so there is no guard to
                            defeat with a bypass flag. */}
                        <Button
                            variant="outline"
                            onClick={() => router.push(back)}
                            className="border-red-300 text-red-700 hover:border-red-500"
                        >
                            Leave
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
