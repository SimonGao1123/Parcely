// No 'use client' — renders on the client via StorefrontNavbar.
// This theme has no header: the banner is a strip inside the navbar instead.

import Image from "next/image";
import Link from "next/link";
import type { ThemedNavbarProps } from "./types";
import { AuthControl } from "@/components/authControl";

export function TimelessNavbar({ storefront, pages }: ThemedNavbarProps) {
    const { title, logo_image, banner_image } = storefront;

    return (
        <nav className="bg-[var(--sf-bg)] font-[family-name:var(--sf-font)] text-[var(--sf-fg)]">
            {/* fixed height + object-cover crops the banner rather than squashing it */}
            <div className="relative flex h-24 w-full items-center justify-center overflow-hidden bg-[var(--sf-bg)]">
                {/* presigned urls expire, so they can't be optimized */}
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

                {logo_image ? (
                    <Image
                        src={logo_image.url}
                        alt={title}
                        width={160}
                        height={160}
                        unoptimized
                        className="relative max-h-16 w-auto object-contain"
                    />
                ) : (
                    <h1 className="relative text-2xl tracking-[0.2em] uppercase">
                        {title}
                    </h1>
                )}

                <div className="absolute top-2 right-4 flex items-center">
                    <AuthControl className="text-xs uppercase tracking-[0.2em] opacity-80 transition-opacity hover:opacity-100" />
                </div>
            </div>

            <div className="flex items-center justify-center gap-8 border-b border-current/15 px-6 py-2">
                {pages.map((page) => (
                    <Link
                        key={page.id}
                        href={`/${storefront.slug}/${page.slug}`}
                        className="flex items-center gap-1.5 text-xs uppercase tracking-[0.2em] opacity-80 transition-opacity hover:opacity-100"
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
            </div>
        </nav>
    );
}
