'use client';

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import Button from "@/components/button";
import { createPage } from "@/lib/api/page/createPage";
import { deletePage } from "@/lib/api/page/deletePage";
import { updatePage } from "@/lib/api/page/updatePage";
import type { PageSummary } from "@/types/page";
import type { Storefront } from "@/types/storefront";
import { orderPages } from "../storefront/orderPages";
import PageForm, { type PageFormValue } from "./pageForm";

// /<storefrontSlug>/settings is a static route, so it wins over the dynamic
// /<storefrontSlug>/<pageSlug>. A page slugged "settings" would still be
// created fine but its public URL would resolve to this screen instead.
const RESERVED_SLUGS = new Set(["settings"]);

// Approximates django.utils.text.slugify well enough to catch the collision
// above. It does not have to match exactly — the backend remains authoritative
// for the slug that is actually stored.
function slugify(title: string): string {
    return title
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function reservedError(title: string): string | null {
    return RESERVED_SLUGS.has(slugify(title))
        ? `"${title}" is reserved — its URL is used by the editor. Pick another name.`
        : null;
}

export default function PageManager({ storefront }: { storefront: Storefront }) {
    const pages = orderPages(storefront);
    const homepageId = storefront.homepage?.id;

    const [editingId, setEditingId] = useState<number | null>(null);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Every mutation revalidates the storefront tree, so `storefront.pages`
    // arrives updated on the next render — there is no local page list to keep
    // in sync, only the transient edit state to clear.
    const run = async (action: () => Promise<{ error: string } | void>) => {
        setError(null);
        setPending(true);
        const result = await action();
        setPending(false);
        if (result?.error) {
            setError(result.error);
            return false;
        }
        return true;
    };

    const handleAdd = async (value: PageFormValue) => {
        const reserved = reservedError(value.title);
        if (reserved) {
            setError(reserved);
            return false;
        }
        return run(() => createPage(storefront.slug, value));
    };

    const handleSave = async (page: PageSummary, value: PageFormValue) => {
        const reserved = reservedError(value.title);
        if (reserved) {
            setError(reserved);
            return false;
        }

        // title is always sent; the backend only regenerates the slug when the
        // value actually differs, so resending an unchanged one is a no-op
        const saved = await run(() => updatePage(storefront.slug, page.slug, value));
        if (saved) setEditingId(null);
        return saved;
    };

    const handleDelete = async (page: PageSummary) => {
        if (!window.confirm(`Delete "${page.title}" and all of its blocks? This can't be undone.`)) {
            return;
        }
        await run(() => deletePage(storefront.slug, page.slug));
    };

    return (
        <section className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-stone-900">Pages</h2>

            <ul className="flex flex-col divide-y divide-stone-200 rounded-lg border border-stone-200">
                {pages.map((page) => (
                    <li key={page.id} className="flex items-center gap-3 px-4 py-3">
                        {editingId === page.id ? (
                            <PageForm
                                // remount per page so the form seeds from the
                                // right page when switching rows
                                key={page.id}
                                initialTitle={page.title}
                                existingLogoUrl={page.logo_image?.url}
                                submitLabel="Save"
                                pending={pending}
                                onSubmit={(value) => handleSave(page, value)}
                                onError={setError}
                                onCancel={() => setEditingId(null)}
                            />
                        ) : (
                            <>
                                {/* presigned urls expire, so they can't be optimized */}
                                {page.logo_image && (
                                    <Image
                                        src={page.logo_image.url}
                                        alt=""
                                        width={24}
                                        height={24}
                                        unoptimized
                                        className="size-6 rounded object-contain"
                                    />
                                )}

                                <span className="flex-1 text-sm text-stone-800">{page.title}</span>

                                {page.id === homepageId && (
                                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold tracking-wider text-stone-600">
                                        HOMEPAGE
                                    </span>
                                )}

                                <Link
                                    href={`/${storefront.slug}/${page.slug}/edit`}
                                    className="text-sm text-stone-500 underline hover:text-stone-800"
                                >
                                    Edit blocks
                                </Link>

                                <Button variant="link" onClick={() => setEditingId(page.id)}>
                                    Edit
                                </Button>

                                {/* The homepage has no delete control at all. The
                                    backend rejects it too, but that 400 is a
                                    backstop rather than the interaction. */}
                                {page.id !== homepageId && (
                                    <Button
                                        variant="link"
                                        disabled={pending}
                                        onClick={() => handleDelete(page)}
                                        className="text-red-600 hover:text-red-800"
                                    >
                                        Delete
                                    </Button>
                                )}
                            </>
                        )}
                    </li>
                ))}
            </ul>

            <div className="flex flex-col gap-2 rounded-lg border border-stone-200 p-4">
                <span className="text-sm font-medium text-stone-700">Add a page</span>
                <PageForm submitLabel="Add page" pending={pending} onSubmit={handleAdd} onError={setError} />
            </div>

            {error && (
                <p className="whitespace-pre-line rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                </p>
            )}
        </section>
    );
}
