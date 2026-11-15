// No 'use client' — renders inside StorefrontNavbar, so it inherits that
// boundary, like CartLink beside it.

import Link from "next/link";

// Where a buyer finds what they bought here, signed in or not. Themes pass their
// own nav-link classes, as they do for CartLink.
export function PurchasesLink({
    slug,
    hidden,
    className,
}: {
    slug: string;
    // A draft has nothing to buy, so it has nothing to look back at either.
    hidden: boolean;
    className?: string;
}) {
    if (hidden) return null;
    return (
        <Link href={`/${slug}/purchases`} className={className}>
            Purchases
        </Link>
    );
}
