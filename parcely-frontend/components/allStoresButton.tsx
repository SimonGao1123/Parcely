'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";

// Rendered once from the root layout so every route gets it without each one
// opting in. `/` is the destination, so it hides itself there rather than
// linking to the page you are already on.
//
// z-40 keeps it under the z-50 navbars: both are fixed and the storefront bar
// slides down over this corner when it reveals on scroll.
export default function AllStoresButton() {
    const pathname = usePathname();
    if (pathname === "/") return null;

    return (
        <Link
            href="/"
            className="fixed right-6 bottom-6 z-40 rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm font-medium text-stone-900 shadow-lg backdrop-blur transition-colors hover:bg-white"
        >
            All stores
        </Link>
    );
}
