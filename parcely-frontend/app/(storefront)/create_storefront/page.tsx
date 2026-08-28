import CreateStorefrontForm from "../_components/storefront/createStorefrontForm";

export default function CreateStorefrontPage() {
    return (
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-2xl font-bold">Create Storefront</h1>
            <CreateStorefrontForm />
        </div>
    );
}