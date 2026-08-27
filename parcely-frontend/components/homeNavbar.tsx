'use client';

import { AuthControl } from "./authControl";
import { useNavbarVisibility } from "./useNavbarVisibility";

export default function HomeNavbar() {
    const visible = useNavbarVisibility();

    return (
        <div
            // no `inert` while hidden — it would block focus-within, leaving the
            // nav permanently unreachable by keyboard after any scroll down
            className={`fixed inset-x-0 top-0 z-50 transition-transform duration-300 focus-within:translate-y-0 ${
                visible ? "translate-y-0" : "-translate-y-full"
            }`}
        >
            <nav className="flex items-center justify-end border-b border-stone-200 bg-stone-100 px-6 py-3 text-stone-700">
                <AuthControl className="text-sm transition-colors hover:text-stone-950" />
            </nav>
        </div>
    );
}
