// No 'use client': this only forwards props, so it inherits whichever boundary
// the caller is already in.

import type { ComponentProps } from "react";

export type ButtonVariant = "primary" | "outline" | "chip" | "link" | "unstyled";

const BASE = "cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const VARIANTS: Record<ButtonVariant, string> = {
    primary: "rounded-lg bg-stone-800 px-4 py-2 text-sm text-stone-50 hover:bg-stone-950",
    // disabled:hover guard, otherwise the border still reacts to hover at 50% opacity
    outline:
        "rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:border-stone-500 disabled:hover:border-stone-300",
    chip: "rounded-full border px-3 py-1 text-sm capitalize",
    link: "text-sm text-stone-500 underline hover:text-stone-800",
    // for callers that supply their own appearance — themed navbars pass the
    // class list of their nav links so the button matches the storefront theme
    unstyled: "",
};

// Exported because the settings tabs are <Link>s and so can't be Buttons, but
// have to look exactly like a chip. Sharing the tokens keeps them from drifting.
export const CHIP_BASE = "rounded-full border px-3 py-1 text-sm transition-colors";
export const CHIP_ON = "border-stone-800 bg-stone-800 text-stone-50";
export const CHIP_OFF = "border-stone-300 text-stone-700 hover:border-stone-500";

type ButtonProps = ComponentProps<"button"> & {
    variant?: ButtonVariant;
    // chip only; also drives aria-pressed
    active?: boolean;
};

export default function Button({
    variant = "primary",
    active,
    className,
    // defaulting to "button" rather than the HTML default "submit" so a button
    // dropped inside a form can't submit it by accident
    type = "button",
    ...props
}: ButtonProps) {
    const chipState = variant === "chip" ? (active ? CHIP_ON : CHIP_OFF) : "";

    return (
        <button
            type={type}
            aria-pressed={active}
            className={[BASE, VARIANTS[variant], chipState, className].filter(Boolean).join(" ")}
            {...props}
        />
    );
}
