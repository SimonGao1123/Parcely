import { requireStorefrontOwner } from "@/app/(storefront)/_components/editor/requireOwner";
import ProductManager from "@/app/(storefront)/_components/editor/product/productManager";
import { getPages } from "@/lib/api/page/getPages";
import { getProducts } from "@/lib/api/product/getProducts";

export default async function ProductsPage({ params }: PageProps<"/[storefrontSlug]/products">) {
    const { storefrontSlug } = await params;

    // independent requests — awaiting them in sequence would waterfall.
    // Product pages are deliberately absent from storefront.pages, so they are
    // fetched separately here.
    const [storefront, products, pages] = await Promise.all([
        requireStorefrontOwner(storefrontSlug),
        getProducts(storefrontSlug),
        getPages(storefrontSlug, "product"),
    ]);

    return <ProductManager storefront={storefront} products={products} pages={pages} />;
}
