import { requireStorefrontOwner } from "@/app/(storefront)/_components/editor/requireOwner";
import ProductManager from "@/app/(storefront)/_components/editor/product/productManager";
import { getProducts } from "@/lib/api/product/getProducts";

export default async function ProductsPage({ params }: PageProps<"/[storefrontSlug]/products">) {
    const { storefrontSlug } = await params;

    // independent requests — awaiting them in sequence would waterfall
    const [storefront, products] = await Promise.all([
        requireStorefrontOwner(storefrontSlug),
        getProducts(storefrontSlug),
    ]);

    return <ProductManager storefront={storefront} products={products} />;
}
