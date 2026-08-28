// No 'use client' — the Clerk components carry their own boundary.

import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import Button from "./button";

// Behaviour is shared across themes; appearance is not. Each themed navbar
// passes the class list it uses for its own nav links so the signed-out state
// matches that theme instead of Clerk's default button styling.
export function AuthControl({ className }: { className?: string }) {
    return (
        // `Show` renders null while Clerk loads, so the slot is briefly empty
        <Show
            when="signed-in"
            fallback={
                // modal keeps the visitor on the storefront instead of
                // redirecting away to /sign-in
                <SignInButton mode="modal">
                    {/* unstyled: the themed navbar supplies the appearance via className */}
                    <Button variant="unstyled" className={className}>
                        Sign in
                    </Button>
                </SignInButton>
            }
        >
            <UserButton />
        </Show>
    );
}
