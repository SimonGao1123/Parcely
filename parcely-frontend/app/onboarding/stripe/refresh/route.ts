import { redirect } from "next/navigation";
import { getMe } from "@/lib/api/auth/getMe";
import { startOnboarding } from "@/lib/api/billing/startOnboarding";

// Stripe's refresh_url, hit when an AccountLink is expired, already used, or
// otherwise invalid. Stripe's contract is to mint a fresh link with the same
// parameters and send the seller onward, which is exactly what startOnboarding does.
//
// Authenticated before acting, as Stripe's docs require: the link that lands here is
// single-use, but this URL is permanent and guessable.
export async function GET() {
    const me = await getMe();
    if (!me) {
        redirect("/sign-in");
    }

    // A null status means no connected account exists yet, and startOnboarding would
    // create one. That belongs to a deliberate button press, not to a GET that any
    // page could trigger with an <img> tag.
    if (me.card_payments_status === null) {
        redirect("/profile");
    }

    // Redirects to Stripe on success. Must not be wrapped in try/catch - redirect()
    // signals by throwing.
    await startOnboarding();

    // Only reached when the mint failed. /profile re-reads the real status and offers
    // the button again, which surfaces the error properly.
    redirect("/profile");
}
