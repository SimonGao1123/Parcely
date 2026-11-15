import { notFound } from "next/navigation";
import { SignInButton } from "@clerk/nextjs";
import EmailVerification from "@/app/(storefront)/_components/checkout/emailVerification";
import Button from "@/components/button";
import LinkTabs from "@/components/linkTabs";
import PurchaseList from "@/components/purchases/purchaseList";
import { getMe } from "@/lib/api/auth/getMe";
import { getStorePurchases, type PurchaseKind } from "@/lib/api/purchases/getPurchases";
import { getStorefrontDetails } from "@/lib/api/storefront/getStorefrontDetails";
import SignOutPurchasesButton from "./signOutPurchasesButton";

// What a buyer has bought from this one store. Signed in, their account answers;
// a guest proves their email with a code first, since a guest purchase has no
// account to sign into. Rendered by each subtab page, which knows which it is.
export default async function StorePurchasesView({
    storefrontSlug,
    kind,
    page,
}: {
    storefrontSlug: string;
    kind: PurchaseKind;
    page: number;
}) {
    const [storefront, me, data] = await Promise.all([
        getStorefrontDetails(storefrontSlug),
        getMe(),
        getStorePurchases(storefrontSlug, kind, page),
    ]);

    // Nothing can have been bought from a draft.
    if (storefront.is_draft) notFound();

    const base = `/${storefrontSlug}/purchases`;

    return (
        <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-6 py-12 font-[family-name:var(--sf-font)]">
            <h1 className="text-3xl font-semibold">Purchases</h1>

            {data === null ? (
                <section className="flex flex-col gap-4 rounded-lg border border-current/15 px-4 py-4">
                    <div className="flex flex-col gap-0.5">
                        <h2 className="font-medium">Confirm your email</h2>
                        <p className="text-sm opacity-70">
                            Enter the email you used at checkout and we&apos;ll send a code to show
                            your subscriptions and orders from {storefront.title}.
                        </p>
                    </div>
                    <EmailVerification storefrontSlug={storefrontSlug} purpose="purchases" />
                    <div className="flex items-center gap-2 border-t border-current/10 pt-3 text-sm">
                        <span className="opacity-70">Have a Parcely account?</span>
                        <SignInButton mode="modal">
                            <Button variant="unstyled" className="font-medium underline">
                                Sign in
                            </Button>
                        </SignInButton>
                    </div>
                </section>
            ) : (
                <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <LinkTabs
                            themed
                            tabs={[
                                { href: `${base}/subscriptions`, label: "Subscriptions", active: kind === "subscriptions" },
                                { href: `${base}/orders`, label: "Orders", active: kind === "orders" },
                            ]}
                        />
                        {me ? (
                            <span className="text-sm opacity-70">Signed in as {me.email}</span>
                        ) : (
                            <SignOutPurchasesButton storefrontSlug={storefrontSlug} />
                        )}
                    </div>
                    <PurchaseList
                        kind={kind}
                        data={data}
                        page={page}
                        hrefFor={(next) => `${base}/${kind}${next > 1 ? `?page=${next}` : ""}`}
                        showStorefront={false}
                    />
                </>
            )}
        </main>
    );
}
