'use client';

import { AuthControl } from "./authControl";
import Button from "./button";
import { useNavbarVisibility } from "./useNavbarVisibility";
import { usePathname, useRouter } from "next/navigation";

export default function HomeNavbar() {
    const visible = useNavbarVisibility();
    const router = useRouter();
    return (
        <div
            // no `inert` while hidden — it would block focus-within, leaving the
            // nav permanently unreachable by keyboard after any scroll down
            className={`fixed inset-x-0 top-0 z-50 transition-transform duration-300 focus-within:translate-y-0 ${
                visible ? "translate-y-0" : "-translate-y-full"
            }`}
        >
            <nav className="flex items-center justify-between border-b border-stone-200 bg-stone-100 px-6 py-3 text-stone-700">
                <div className="flex items-center gap-3">
                    <Button onClick={() => router.push("/create_storefront")}>
                        Create storefront
                    </Button>
                    {/* /personal redirects to sign-in when signed out, same as
                        /create_storefront — so neither needs a signed-in guard here */}
                    <Button variant="outline" onClick={() => router.push("/personal")}>
                        My storefronts
                    </Button>
                    {/* /profile redirects home when signed out, so it needs no guard either */}
                    <Button variant="outline" onClick={() => router.push("/profile")}>
                        Profile
                    </Button>
                </div>
                <AuthControl className="text-sm transition-colors hover:text-stone-950" />
            </nav>
        </div>
    );
}
