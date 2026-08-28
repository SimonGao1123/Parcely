import { getPage } from "@/lib/api/page/getPage";

export default async function Page({ params }: { params: Promise<{ storefrontSlug: string, pageSlug: string }> }) {
    const { storefrontSlug, pageSlug } = await params;
    const page = await getPage(storefrontSlug, pageSlug);
    console.log(page);
    return <div>{page.title}</div>;
}