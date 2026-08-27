// No 'use client' — renders on the client via StorefrontNavbar.
// The storefront identity sits in the navbar, so the header carries only the
// banner and description.

import Image from "next/image";
import Link from "next/link";
import type { PageSummary } from "@/types/page";
import type { ThemedHeaderProps, ThemedNavbarProps } from "./types";
import { AuthControl } from "../../../../../components/authControl";

function NavLink({ page, slug }: { page: PageSummary; slug: string }) {
    return (
        <Link
            href={`/${slug}/${page.slug}`}
            className="flex items-center gap-1.5 text-sm uppercase tracking-[0.1em] opacity-80 transition-opacity hover:opacity-100"
        >
            {page.title}
            {/* presigned urls expire, so they can't be optimized */}
            {page.logo_image && (
                <Image
                    src={page.logo_image.url}
                    alt=""
                    width={14}
                    height={14}
                    unoptimized
                    className="size-3.5 object-contain"
                />
            )}
        </Link>
    );
}

export function ContemporaryNavbar({ storefront, pages }: ThemedNavbarProps) {
    const { title, logo_image, slug } = storefront;
    const mid = Math.ceil(pages.length / 2);

    return (
        // grid keeps the centre cell optically centred as link widths change
        <nav className="grid grid-cols-3 items-center border-b border-current/15 px-6 py-3 font-[family-name:var(--sf-font)] text-[var(--sf-fg)]">
            <div className="flex items-center justify-start gap-6">
                {pages.slice(0, mid).map((page) => (
                    <NavLink key={page.id} page={page} slug={slug} />
                ))}
            </div>

            <div className="flex items-center justify-center">
                {logo_image ? (
                    <Image
                        src={logo_image.url}
                        alt={title}
                        width={120}
                        height={120}
                        unoptimized
                        className="max-h-10 w-auto object-contain"
                    />
                ) : (
                    <span className="text-lg font-semibold tracking-[0.1em] uppercase">
                        {title}
                    </span>
                )}
            </div>

            <div className="flex items-center justify-end gap-6">
                {pages.slice(mid).map((page) => (
                    <NavLink key={page.id} page={page} slug={slug} />
                ))}
                <AuthControl className="text-sm uppercase tracking-[0.1em] opacity-80 transition-opacity hover:opacity-100" />
            </div>
        </nav>
    );
}

export function ContemporaryHeader({ storefront }: ThemedHeaderProps) {
    const { description, banner_image } = storefront;

    // nothing to show — this theme has no title in the header to fall back on
    if (!banner_image && !description) return null;

    return (
        <header className="relative aspect-3/1 w-full bg-[var(--sf-bg)] font-[family-name:var(--sf-font)] text-[var(--sf-fg)]">
            {banner_image && (
                <Image
                    src={banner_image.url}
                    alt=""
                    fill
                    unoptimized
                    priority
                    className="object-cover"
                />
            )}

            {description && (
                <p className="absolute inset-x-0 bottom-0 px-10 pb-10 text-center text-sm opacity-90">
                    {description}
                </p>
            )}
        </header>
    );
}
