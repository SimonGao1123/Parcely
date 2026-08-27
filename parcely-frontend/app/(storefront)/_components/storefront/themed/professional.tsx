// No 'use client' — renders on the client via StorefrontNavbar.
// This theme has no header: the banner is the navbar's own background.

import Image from "next/image";
import Link from "next/link";
import type { ThemedNavbarProps } from "./types";
import { AuthControl } from "../../../../../components/authControl";

export function ProfessionalNavbar({ storefront, pages }: ThemedNavbarProps) {
    const { title, logo_image, banner_image, slug } = storefront;

    return (
        <nav className="relative flex items-center gap-8 overflow-hidden bg-[var(--sf-bg)] px-6 py-3 font-[family-name:var(--sf-font)] text-[var(--sf-fg)]">
            {banner_image && (
                <>
                    {/* presigned urls expire, so they can't be optimized */}
                    <Image
                        src={banner_image.url}
                        alt=""
                        fill
                        unoptimized
                        priority
                        className="object-cover"
                    />
                    {/* scrim in the storefront's own background colour: the font
                        colour was chosen to be legible against it, so tinting
                        toward it restores contrast whatever the banner looks like */}
                    <div className="absolute inset-0 bg-[var(--sf-bg)]/65" />
                </>
            )}

            {logo_image ? (
                <Image
                    src={logo_image.url}
                    alt={title}
                    width={120}
                    height={120}
                    unoptimized
                    className="relative max-h-10 w-auto shrink-0 object-contain"
                />
            ) : (
                <span className="relative shrink-0 text-base font-semibold tracking-[0.1em] uppercase">
                    {title}
                </span>
            )}

            {pages.map((page) => (
                <Link
                    key={page.id}
                    href={`/${slug}/${page.slug}`}
                    className="relative flex items-center gap-1.5 text-sm uppercase tracking-[0.1em] opacity-80 transition-opacity hover:opacity-100"
                >
                    {page.title}
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
            ))}

            <div className="relative ml-auto flex items-center">
                <AuthControl className="text-sm uppercase tracking-[0.1em] opacity-80 transition-opacity hover:opacity-100" />
            </div>
        </nav>
    );
}
