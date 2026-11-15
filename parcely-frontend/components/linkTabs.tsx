import Link from "next/link";
import { CHIP_BASE, CHIP_OFF, CHIP_ON } from "./button";

export type LinkTab = { href: string; label: string; active: boolean };

// Tabs that are routes, like SettingsTabs, but with the list passed in. `themed`
// swaps the stone chip tokens for the storefront's own colours, so the same tabs
// sit on a storefront page and on the main app without looking foreign on either.
export default function LinkTabs({ tabs, themed = false }: { tabs: LinkTab[]; themed?: boolean }) {
    return (
        <nav className="flex flex-wrap gap-2">
            {tabs.map(({ href, label, active }) => (
                <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={
                        themed
                            ? `${CHIP_BASE} ${active ? "" : "border-current/30 opacity-70 hover:opacity-100"}`
                            : `${CHIP_BASE} ${active ? CHIP_ON : CHIP_OFF}`
                    }
                    style={
                        themed && active
                            ? { background: "var(--sf-fg)", color: "var(--sf-bg)", borderColor: "var(--sf-fg)" }
                            : undefined
                    }
                >
                    {label}
                </Link>
            ))}
        </nav>
    );
}
