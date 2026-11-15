import { redirect } from "next/navigation";

// Subscriptions first: an ongoing charge is what a returning buyer usually wants.
export default async function PurchasesIndex({
    params,
}: {
    params: Promise<{ storefrontSlug: string }>;
}) {
    const { storefrontSlug } = await params;
    redirect(`/${storefrontSlug}/purchases/subscriptions`);
}
