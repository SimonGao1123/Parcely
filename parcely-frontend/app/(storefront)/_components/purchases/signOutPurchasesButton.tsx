'use client';

import { useTransition } from "react";
import Button from "@/components/button";
import { forgetBuyer } from "@/lib/api/checkout/forgetBuyer";

// Drops this browser's purchases code for the storefront - for a shared computer,
// or to look up a different address.
export default function SignOutPurchasesButton({ storefrontSlug }: { storefrontSlug: string }) {
    const [pending, startTransition] = useTransition();
    return (
        <Button
            variant="unstyled"
            disabled={pending}
            onClick={() => startTransition(() => forgetBuyer(storefrontSlug, "purchases"))}
            className="text-sm underline opacity-70 hover:opacity-100"
        >
            {pending ? "Signing out…" : "Not you? Sign out"}
        </Button>
    );
}
