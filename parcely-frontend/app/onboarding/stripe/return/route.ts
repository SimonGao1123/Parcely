import { redirect } from "next/navigation";
import { getMe } from "@/lib/api/auth/getMe";
import { syncOnboardingStatus } from "@/lib/api/billing/syncOnboardingStatus";

// Stripe's return_url. Reaching it does not mean onboarding succeeded - the seller
// can close the flow at any step - so the status is pulled from Stripe before we
// hand them back to the profile page.
//
// A GET because Stripe navigates the browser here. Authenticated first: the URL is
// fixed and guessable, and it should never act on behalf of a signed-out visitor.
export async function GET() {
    const me = await getMe();
    if (!me) {
        redirect("/sign-in");
    }

    // Best effort. A failure here only leaves the status stale until the capability
    // webhook lands, and /profile reads it fresh either way, so there is nothing
    // useful to show the seller instead of their profile.
    await syncOnboardingStatus();

    redirect("/profile");
}
