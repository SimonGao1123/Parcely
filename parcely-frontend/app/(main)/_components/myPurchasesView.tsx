import { SignInButton } from "@clerk/nextjs";
import Button from "@/components/button";
import LinkTabs from "@/components/linkTabs";
import PurchaseList from "@/components/purchases/purchaseList";
import { getMe } from "@/lib/api/auth/getMe";
import { getMyPurchases, type PurchaseKind } from "@/lib/api/purchases/getPurchases";

// Everything this account has bought, across every storefront. Signed in only:
// a guest purchase belongs to one store's seller, so a guest looks it up on that
// store's own Purchases page with an emailed code instead.
export default async function MyPurchasesView({ kind, page }: { kind: PurchaseKind; page: number }) {
    const me = await getMe();

    return (
        <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-6 py-10 text-stone-800">
            <h1 className="text-2xl font-semibold">Purchases</h1>
            {me ? <SignedIn kind={kind} page={page} /> : <SignedOut />}
        </main>
    );
}

async function SignedIn({ kind, page }: { kind: PurchaseKind; page: number }) {
    const data = await getMyPurchases(kind, page);

    return (
        <>
            <LinkTabs
                tabs={[
                    { href: "/purchases/subscriptions", label: "Subscriptions", active: kind === "subscriptions" },
                    { href: "/purchases/orders", label: "Orders", active: kind === "orders" },
                ]}
            />
            <PurchaseList
                kind={kind}
                // null here means the Clerk session lapsed between getMe and this
                // read. Showing the empty state would claim they bought nothing.
                data={data ?? { error: "Your session expired. Sign in again." }}
                page={page}
                hrefFor={(next) => `/purchases/${kind}${next > 1 ? `?page=${next}` : ""}`}
                showStorefront
            />
        </>
    );
}

function SignedOut() {
    return (
        <section className="flex flex-col gap-3 rounded-lg border border-stone-300 bg-white px-5 py-4">
            <p className="text-sm text-stone-600">
                Sign in to see your subscriptions and orders from every store.
            </p>
            <SignInButton mode="modal">
                <Button className="self-start">Sign in</Button>
            </SignInButton>
            <p className="text-sm text-stone-500">
                Bought without an account? Open that store&apos;s Purchases page and confirm your
                email to see what you bought there.
            </p>
        </section>
    );
}
