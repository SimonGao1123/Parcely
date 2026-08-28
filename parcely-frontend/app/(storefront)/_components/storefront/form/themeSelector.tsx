'use client';

import type { Theme } from "@/types/storefront";

export const THEMES: Theme[] = [
    "minimalist",
    "professional",
    "artist",
    "contemporary",
    "timeless",
];

type ThemeSelectorProps = {
    value: Theme;
    onChange: (theme: Theme) => void;
};

export default function ThemeSelector({ value, onChange }: ThemeSelectorProps) {
    return (
        <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-stone-700">Theme</legend>
            <div className="flex flex-wrap gap-2">
                {THEMES.map((theme) => {
                    const active = value === theme;
                    return (
                        <button
                            key={theme}
                            type="button"
                            // unlike the homepage filter chips this never clears:
                            // a storefront always has a theme
                            onClick={() => onChange(theme)}
                            aria-pressed={active}
                            className={`cursor-pointer rounded-full border px-3 py-1 text-sm capitalize transition-colors ${
                                active
                                    ? "border-stone-800 bg-stone-800 text-stone-50"
                                    : "border-stone-300 text-stone-700 hover:border-stone-500"
                            }`}
                        >
                            {theme}
                        </button>
                    );
                })}
            </div>
        </fieldset>
    );
}
