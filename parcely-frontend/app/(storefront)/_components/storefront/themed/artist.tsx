// No 'use client' — renders on the client via StorefrontNavbar, but stays a
// server component when a page imports ArtistHeader directly.

import Image from "next/image";
import Link from "next/link";
import type { ThemedHeaderProps, ThemedNavbarProps } from "./types";
import { AuthControl } from "../../../../../components/authControl";

export function ArtistNavbar({ storefront, pages }: ThemedNavbarProps) {
    return (
        <nav className="flex items-center gap-8 border-b border-current/15 px-6 py-3 font-[family-name:var(--sf-font)] text-[var(--sf-fg)]">
            {pages.map((page) => (
                <Link
                    key={page.id}
                    href={`/${storefront.slug}/${page.slug}`}
                    className="flex items-center gap-1.5 text-sm uppercase tracking-[0.15em] opacity-80 transition-opacity hover:opacity-100"
                >
                    {page.title}
                    {/* presigned urls expire, so they can't be optimized */}
                    {page.logo_image && (
                        <Image
                            src={page.logo_image.url}
                            alt=""
                            width={16}
                            height={16}
                            unoptimized
                            className="size-4 object-contain"
                        />
                    )}
                </Link>
            ))}

            <div className="ml-auto flex items-center">
                <AuthControl className="text-sm uppercase tracking-[0.15em] opacity-80 transition-opacity hover:opacity-100" />
            </div>
        </nav>
    );
}

export function ArtistHeader({ storefront }: ThemedHeaderProps) {
    const { title, description, logo_image, banner_image } = storefront;

    const identity = (align: string) => (
        <div className={`flex max-w-md flex-col gap-2 ${align}`}>
            {logo_image ? (
                <Image
                    src={logo_image.url}
                    alt={title}
                    width={220}
                    height={220}
                    unoptimized
                    className="h-auto w-44 object-contain"
                />
            ) : (
                <h1 className="text-4xl font-bold uppercase tracking-tight">
                    {title}
                </h1>
            )}

            {description && (
                <p className="text-sm opacity-80">{description}</p>
            )}
        </div>
    );

    if (!banner_image) {
        return (
            <header className="flex w-full flex-col items-center bg-[var(--sf-bg)] px-6 py-20 text-center font-[family-name:var(--sf-font)] text-[var(--sf-fg)]">
                {identity("items-center")}
            </header>
        );
    }

    return (
        <header className="relative w-full font-[family-name:var(--sf-font)] text-[var(--sf-fg)]">
            <div className="relative aspect-3/1 w-full">
                <Image
                    src={banner_image.url}
                    alt=""
                    fill
                    unoptimized
                    priority
                    className="object-cover"
                />
            </div>

            <div className="absolute inset-0 flex items-center justify-end px-10 text-right">
                {identity("items-end")}
            </div>
        </header>
    );
}
