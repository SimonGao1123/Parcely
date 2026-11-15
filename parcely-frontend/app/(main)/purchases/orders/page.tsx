import MyPurchasesView from "@/app/(main)/_components/myPurchasesView";
import { pageParam } from "@/components/purchases/pager";

export default async function MyOrdersPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string | string[] }>;
}) {
    const { page } = await searchParams;
    return <MyPurchasesView kind="orders" page={pageParam(page)} />;
}
