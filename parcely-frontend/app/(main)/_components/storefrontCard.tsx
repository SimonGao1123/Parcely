'use client';
import Image from "next/image";
import Link from "next/link";
import type { StorefrontSummary } from "@/types/storefront";
// used for display on homepage when displaying all storefronts, additionally used when displaying all storefronts a user owns

export default function StorefrontCard({
    storefront,
    settingsHref,
}: {
    storefront: StorefrontSummary;
    // Opt-in, and only /personal supplies it. That list is owner-scoped, which
    // is what keeps the gear off the public feed rather than any check here.
    settingsHref?: string;
}) {
    // will get storefronts FROM storefront list api AND all storefronts view
    const { title, banner_image, logo_image, is_draft } = storefront;

    return (
        // The card link can't be the root any more — a link cannot nest inside a
        // link, and the gear is one. `group` moves here so both children still
        // react to hovering the card as a whole.
        <div className="group relative aspect-video w-full overflow-hidden rounded-xl bg-neutral-200">
            <Link
                href={`/${storefront.slug}/${storefront.homepage?.slug ?? 'home'}`}
                className="absolute inset-0"
            >
                {/* blob urls are presigned and expire, so they can't be optimized/cached */}
                {banner_image && (
                    <Image
                        src={banner_image.url}
                        alt=""
                        fill
                        unoptimized
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                )}

                {/* only ever visible on /personal — the public list filters drafts out.
                    z-10 keeps it above the hover overlay, which would otherwise darken it. */}
                {is_draft && (
                    <span className="absolute top-3 left-3 z-10 rounded-full bg-stone-700/90 px-2.5 py-1 text-[11px] font-semibold tracking-wider text-white">
                        DRAFT
                    </span>
                )}

                <div className="absolute inset-0 flex items-end bg-linear-to-t from-black/70 via-black/20 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    <h3 className="line-clamp-2 p-4 pr-24 text-lg font-semibold text-white">
                        {title}
                    </h3>
                </div>

                {logo_image && (
                    <Image
                        src={logo_image.url}
                        alt=""
                        width={56}
                        height={56}
                        unoptimized
                        className="absolute right-3 bottom-3 size-14 rounded-lg border-2 border-white object-cover shadow-md"
                    />
                )}
            </Link>

            {/* z-20 to sit above the card link, which covers the whole card */}
            {settingsHref && (
                <Link
                    href={settingsHref}
                    aria-label={`Settings for ${title}`}
                    className="absolute top-3 right-3 z-20 rounded-full bg-stone-900/80 px-2.5 py-1.5 text-sm leading-none text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 hover:bg-stone-900 focus-visible:opacity-100"
                >
                    ⚙
                </Link>
            )}
        </div>
    )
}
