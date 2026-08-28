'use client';

import type { Theme } from "@/types/storefront";
import Button from "@/components/button";

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
                        <Button
                            key={theme}
                            variant="chip"
                            active={active}
                            // unlike the homepage filter chips this never clears:
                            // a storefront always has a theme
                            onClick={() => onChange(theme)}
                        >
                            {theme}
                        </Button>
                    );
                })}
            </div>
        </fieldset>
    );
}
