// No 'use client' — renders on the client via StorefrontNavbar.

import Image from "next/image";
import Link from "next/link";
import type { ThemedHeaderProps, ThemedNavbarProps } from "./types";
import { AuthControl } from "../../../../../components/authControl";

export function MinimalistNavbar({ storefront, pages }: ThemedNavbarProps) {
    const { title, logo_image, slug } = storefront;

    return (
        <nav className="flex items-center justify-between border-b border-current/10 px-8 py-4 font-[family-name:var(--sf-font)] text-[var(--sf-fg)]">
            {/* presigned urls expire, so they can't be optimized */}
            {logo_image ? (
                <Image
                    src={logo_image.url}
                    alt={title}
                    width={120}
                    height={120}
                    unoptimized
                    className="max-h-8 w-auto object-contain"
                />
            ) : (
                <span className="text-base tracking-[0.1em] uppercase">{title}</span>
            )}

            <div className="flex items-center gap-6">
                {pages.map((page) => (
                    <Link
                        key={page.id}
                        href={`/${slug}/${page.slug}`}
                        className="flex items-center gap-1.5 text-sm opacity-70 transition-opacity hover:opacity-100"
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
                <AuthControl className="text-sm opacity-70 transition-opacity hover:opacity-100" />
            </div>
        </nav>
    );
}

export function MinimalistHeader({ storefront }: ThemedHeaderProps) {
    const { title, description, banner_image } = storefront;

    return (
        <header className="flex w-full items-center gap-12 bg-[var(--sf-bg)] px-8 py-20 font-[family-name:var(--sf-font)] text-[var(--sf-fg)]">
            <div className="flex flex-1 flex-col gap-4">
                <h1 className="text-4xl tracking-tight">{title}</h1>
                {description && (
                    <p className="max-w-md text-sm opacity-70">{description}</p>
                )}
            </div>

            {/* contained block rather than a full-bleed background */}
            {banner_image && (
                <div className="relative aspect-4/3 w-2/5 shrink-0">
                    <Image
                        src={banner_image.url}
                        alt=""
                        fill
                        unoptimized
                        priority
                        className="object-cover"
                    />
                </div>
            )}
        </header>
    );
}
