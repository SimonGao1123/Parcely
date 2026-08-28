'use client';

import { useEffect, useRef } from "react";
import Button from "@/components/button";

// Native <dialog> rather than a hand-rolled overlay. showModal() renders into
// the top layer, so no ancestor can trap it — which matters here because the
// editor grid sets container-type: inline-size, and that implies layout
// containment, making it a containing block for any fixed descendant. It also
// brings Esc, a focus trap and inertness of the page behind it for free.
export default function Modal({
    open,
    onClose,
    title,
    children,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
}) {
    const dialogRef = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        // showModal() throws if the dialog is already open, and close() on a
        // closed one is a no-op that still fires nothing — so both are guarded
        // by the element's own state rather than by `open` alone.
        if (open && !dialog.open) dialog.showModal();
        if (!open && dialog.open) dialog.close();
    }, [open]);

    return (
        <dialog
            ref={dialogRef}
            // the `close` event, not the buttons: Esc and the backdrop dismiss
            // the dialog natively without passing through any handler of ours,
            // and this is the one path all three share
            onClose={onClose}
            // clicking the backdrop targets the dialog itself; anything inside
            // targets a descendant
            onClick={(event) => {
                if (event.target === dialogRef.current) onClose();
            }}
            className="m-auto w-[min(40rem,calc(100vw-2rem))] rounded-xl border border-stone-200 bg-white p-0 text-stone-900 backdrop:bg-black/40"
        >
            <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3">
                <h2 className="text-sm font-semibold">{title}</h2>
                <Button variant="unstyled" onClick={onClose} aria-label="Close" className="text-stone-500 hover:text-stone-900">
                    ✕
                </Button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        </dialog>
    );
}
