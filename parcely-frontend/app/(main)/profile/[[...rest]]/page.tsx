import { UserProfile } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { getMe } from "@/lib/api/auth/getMe";
import StripeOnboarding from "../../_components/stripeOnboarding";

// Optional catch-all because UserProfile uses path routing and owns its own
// sub-paths, the same arrangement as app/sign-in/[[...sign-in]].
export default async function ProfilePage() {
    const me = await getMe();
    if (!me) {
        redirect("/"); // nothing to show without a signed-in user
    }

    return (
        <div className="container mx-auto flex flex-col gap-8 px-4 py-8">
            <h1 className="text-2xl font-bold">Profile</h1>

            {/* Rendered inline rather than through UserButton's modal */}
            <UserProfile path="/profile" />

            <div className="flex flex-col gap-3">
                <h2 className="text-xl font-semibold">Payments</h2>
                <StripeOnboarding status={me.card_payments_status} canSell={me.can_sell} />
            </div>
        </div>
    );
}
