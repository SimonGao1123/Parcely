import { getMe } from "@/lib/api/auth/getMe";
import { redirect } from "next/navigation";

export default async function CreateStorefrontLayout({ children }: { children: React.ReactNode }) {
    const me = await getMe();
    if (!me) {
        redirect("/sign-in"); // must be signed in
    }
    // StoreFront.clean() refuses to create one anyway; this sends the seller
    // somewhere they can act instead of letting the form fail on submit.
    if (!me.can_sell) {
        redirect("/profile");
    }
    return children;
}