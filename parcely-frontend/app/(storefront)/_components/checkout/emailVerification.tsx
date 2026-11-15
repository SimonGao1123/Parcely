'use client';

import { useState, useTransition } from "react";
import { SignInButton } from "@clerk/nextjs";
import Button from "@/components/button";
import { sendCode } from "@/lib/api/checkout/sendCode";
import { verifyCode } from "@/lib/api/checkout/verifyCode";
import type { BuyerPurpose } from "@/types/checkout";
import { INPUT_CLASS, PRIMARY_CLASS, PRIMARY_STYLE } from "./themedStyles";

// Email, then a six-digit code. Used for both checkout and viewing purchases -
// the same code, exchanged for a token of the given purpose.
//
// Nothing to hand back on success: verifyCode sets the cookie and refreshes, and
// the page re-renders past this component on its own.
export default function EmailVerification({
    storefrontSlug,
    purpose,
    defaultEmail,
    lockEmail = false,
}: {
    storefrontSlug: string;
    purpose: BuyerPurpose;
    defaultEmail?: string | null;
    // Signed in: the backend only accepts the account's own address, so offering
    // to edit it would only produce a 403.
    lockEmail?: boolean;
}) {
    const [pending, startTransition] = useTransition();
    const [email, setEmail] = useState(defaultEmail ?? "");
    const [code, setCode] = useState("");
    const [step, setStep] = useState<"email" | "code">("email");
    const [expiresAt, setExpiresAt] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [signInRequired, setSignInRequired] = useState(false);

    const send = () =>
        startTransition(async () => {
            setError(null);
            setSignInRequired(false);
            const result = await sendCode(storefrontSlug, email.trim());
            if ("error" in result) {
                setError(result.error);
                setSignInRequired(Boolean(result.signInRequired));
                return;
            }
            setExpiresAt(result.expires_at);
            setCode("");
            setStep("code");
        });

    const verify = () =>
        startTransition(async () => {
            setError(null);
            const result = await verifyCode(storefrontSlug, email.trim(), code.trim(), purpose);
            if (result) {
                setError(result.error);
                setSignInRequired(Boolean(result.signInRequired));
            }
        });

    return (
        <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
                event.preventDefault();
                if (step === "email") send();
                else verify();
            }}
        >
            <label className="flex flex-col gap-1 text-sm">
                <span className="opacity-70">Email</span>
                <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={lockEmail || step === "code" || pending}
                    className={INPUT_CLASS}
                />
            </label>

            {step === "code" && (
                <label className="flex flex-col gap-1 text-sm">
                    <span className="opacity-70">
                        We sent a 6-digit code to {email.trim()}
                        {expiresAt && ` · expires at ${formatTime(expiresAt)}`}
                    </span>
                    <input
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        required
                        autoFocus
                        value={code}
                        onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                        disabled={pending}
                        className={`${INPUT_CLASS} tracking-[0.4em]`}
                    />
                </label>
            )}

            {error && (
                <div className="flex flex-col gap-2 text-sm text-red-600">
                    <p className="whitespace-pre-line">{error}</p>
                    {signInRequired && (
                        // Modal, never a redirect: a redirect would take the buyer off
                        // the storefront they were about to pay at.
                        <SignInButton mode="modal">
                            <Button variant="unstyled" className={`${PRIMARY_CLASS} self-start`} style={PRIMARY_STYLE}>
                                Sign in
                            </Button>
                        </SignInButton>
                    )}
                </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
                <Button
                    type="submit"
                    variant="unstyled"
                    disabled={pending}
                    className={PRIMARY_CLASS}
                    style={PRIMARY_STYLE}
                >
                    {step === "email"
                        ? pending
                            ? "Sending…"
                            : "Send code"
                        : pending
                          ? "Checking…"
                          : "Verify"}
                </Button>

                {step === "code" && (
                    <>
                        <Button
                            variant="unstyled"
                            onClick={send}
                            disabled={pending}
                            className="text-sm underline opacity-70 hover:opacity-100"
                        >
                            Resend code
                        </Button>
                        {!lockEmail && (
                            <Button
                                variant="unstyled"
                                onClick={() => {
                                    setStep("email");
                                    setError(null);
                                }}
                                disabled={pending}
                                className="text-sm underline opacity-70 hover:opacity-100"
                            >
                                Use a different email
                            </Button>
                        )}
                    </>
                )}
            </div>
        </form>
    );
}

// Only ever runs after a client-side send, never during server render, so the
// browser's own locale and clock cannot cause a hydration mismatch here.
function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
