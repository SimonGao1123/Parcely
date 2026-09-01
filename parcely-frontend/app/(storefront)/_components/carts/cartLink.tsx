// No 'use client' — this renders inside StorefrontNavbar, so it inherits that
// boundary, the same way AuthControl does.

import Link from "next/link";

// Behaviour is shared across themes; appearance is not. Each themed navbar
// passes the class list it uses for its own nav links, so the icon matches that
// theme rather than carrying styling of its own.
export function CartLink({
    slug,
    count,
    className,
}: {
    slug: string;
    count: number | null;
    className?: string;
}) {
    // null rather than 0: a draft storefront has no cart at all, and keeping
    // that rule here means the five themed navbars stay one line each.
    if (count === null) return null;

    return (
        <Link
            href={`/${slug}/cart`}
            aria-label={count > 0 ? `Cart, ${count} item${count === 1 ? "" : "s"}` : "Cart"}
            className={`relative inline-flex ${className ?? ""}`}
        >
            {/* inline rather than an icon component — the app has no icon
                library, and next/image is reserved for uploaded blobs */}
            <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className="size-5"
            >
                <path d="M2.5 3h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.2L20 6.5H5.2" />
                <circle cx="9.5" cy="19.5" r="1.3" />
                <circle cx="17" cy="19.5" r="1.3" />
            </svg>

            {count > 0 && (
                // Colours inverted against the bar so the badge reads on any
                // theme without each one having to style it.
                <span
                    className="absolute -top-1.5 -right-2 min-w-4 rounded-full px-1 text-center text-[0.625rem] leading-4 font-semibold"
                    style={{ background: "var(--sf-fg)", color: "var(--sf-bg)" }}
                >
                    {count > 99 ? "99+" : count}
                </span>
            )}
        </Link>
    );
}
