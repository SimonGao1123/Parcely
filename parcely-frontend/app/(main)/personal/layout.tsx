import { redirect } from "next/navigation";
import { getMe } from "@/lib/api/auth/getMe";

export default async function PersonalLayout({ children }: { children: React.ReactNode }) {
    const me = await getMe();
    if (!me) {
        redirect("/sign-in"); // must be signed in
    }
    return children;
}