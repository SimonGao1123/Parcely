import MyPurchasesView from "@/app/(main)/_components/myPurchasesView";
import { pageParam } from "@/components/purchases/pager";

export default async function MySubscriptionsPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string | string[] }>;
}) {
    const { page } = await searchParams;
    return <MyPurchasesView kind="subscriptions" page={pageParam(page)} />;
}
