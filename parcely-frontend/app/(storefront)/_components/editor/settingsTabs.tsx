import Link from "next/link";
import { CHIP_BASE, CHIP_OFF, CHIP_ON } from "@/components/button";

export type SettingsTab = "settings" | "products";

const TABS: { key: SettingsTab; label: string }[] = [
    { key: "settings", label: "Settings" },
    { key: "products", label: "Products" },
];

// A server component: which tab is active is decided by the route that rendered
// it, so there is nothing to hold on the client. Rendered by each page rather
// than from an (editor)/layout.tsx, which would also wrap /<page>/edit — the
// block editor is not a tab of this.
export default function SettingsTabs({
    storefrontSlug,
    active,
}: {
    storefrontSlug: string;
    active: SettingsTab;
}) {
    return (
        <nav className="flex gap-2">
            {TABS.map(({ key, label }) => (
                <Link
                    key={key}
                    href={`/${storefrontSlug}/${key}`}
                    aria-current={active === key ? "page" : undefined}
                    className={`${CHIP_BASE} ${active === key ? CHIP_ON : CHIP_OFF}`}
                >
                    {label}
                </Link>
            ))}
        </nav>
    );
}
