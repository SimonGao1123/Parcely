import { getMe } from "@/lib/api/auth/getMe";
import { redirect } from "next/navigation";

export default async function CreateStorefrontLayout({ children }: { children: React.ReactNode }) {
    const me = await getMe();
    if (!me) {
        redirect("/sign-in"); // must be signed in
    }
    return children;
}