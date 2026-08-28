'use client';

import type { StorefrontStyle } from "@/types/storefront";
import type { FontFamily } from "@/types/style";

export const FONT_FAMILIES: FontFamily[] = [
    "Inter",
    "Roboto",
    "Playfair Display",
    "Roboto Mono",
];

// mirrors default_storefront_style() in parcely-backend/store/models.py
export const DEFAULT_STOREFRONT_STYLE: StorefrontStyle = {
    background_color: "#ffffff",
    font_family: "Inter",
    font_scale: 1.0,
    font_color: "#000000",
    line_spacing: 1.5,
};

type StyleSelectorProps = {
    value: StorefrontStyle;
    onChange: (style: StorefrontStyle) => void;
};

const labelClass = "text-sm font-medium text-stone-700";

export default function StyleSelector({ value, onChange }: StyleSelectorProps) {
    // the backend schema forbids partial style objects, so every control
    // emits the whole thing
    const set = <K extends keyof StorefrontStyle>(key: K, next: StorefrontStyle[K]) =>
        onChange({ ...value, [key]: next });

    return (
        <fieldset className="flex flex-col gap-4">
            <legend className={labelClass}>Style</legend>

            <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2">
                    <span className="text-sm text-stone-600">Background</span>
                    <input
                        type="color"
                        value={value.background_color}
                        onChange={(e) => set("background_color", e.target.value)}
                        className="h-8 w-12 cursor-pointer rounded border border-stone-300"
                    />
                </label>

                <label className="flex items-center gap-2">
                    <span className="text-sm text-stone-600">Text</span>
                    <input
                        type="color"
                        value={value.font_color}
                        onChange={(e) => set("font_color", e.target.value)}
                        className="h-8 w-12 cursor-pointer rounded border border-stone-300"
                    />
                </label>

                <label className="flex items-center gap-2">
                    <span className="text-sm text-stone-600">Font</span>
                    <select
                        value={value.font_family}
                        onChange={(e) => set("font_family", e.target.value as FontFamily)}
                        className="cursor-pointer rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 focus:outline-none"
                    >
                        {FONT_FAMILIES.map((font) => (
                            <option key={font} value={font}>
                                {font}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            <label className="flex flex-col gap-1">
                <span className="text-sm text-stone-600">
                    Font scale — {value.font_scale.toFixed(1)}
                </span>
                <input
                    type="range"
                    min={0.5}
                    max={3}
                    step={0.1}
                    value={value.font_scale}
                    onChange={(e) => set("font_scale", Number(e.target.value))}
                    className="max-w-xs cursor-pointer"
                />
            </label>

            <label className="flex flex-col gap-1">
                <span className="text-sm text-stone-600">
                    Line spacing — {value.line_spacing.toFixed(1)}
                </span>
                <input
                    type="range"
                    min={0.5}
                    max={3}
                    step={0.1}
                    value={value.line_spacing}
                    onChange={(e) => set("line_spacing", Number(e.target.value))}
                    className="max-w-xs cursor-pointer"
                />
            </label>
        </fieldset>
    );
}
