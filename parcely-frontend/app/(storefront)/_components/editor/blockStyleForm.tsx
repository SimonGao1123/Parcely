'use client';

import type { PageBlockStyle } from "@/types/block";
import type { Alignment, FontFamily } from "@/types/style";
import { FONT_FAMILIES } from "../storefront/form/styleSelector";

const ALIGNMENTS: Alignment[] = ["left", "center", "right"];

// Mirrors default_page_block_style() in parcely-backend/store/models.py. Every
// key present and null, because a block style only stores overrides.
export const DEFAULT_PAGE_BLOCK_STYLE: PageBlockStyle = {
    background_color: null,
    font_family: null,
    font_scale: null,
    font_color: null,
    line_spacing: null,
    alignment: "left",
    padding: null,
};

// What a field becomes the moment its override is switched on. Only used to
// seed the control — the storefront's own value isn't reachable from here.
const SEEDS = {
    background_color: "#ffffff",
    font_family: "Inter" as FontFamily,
    font_scale: 1,
    font_color: "#000000",
    line_spacing: 1.5,
    padding: 0,
};

function Override({
    label,
    on,
    onToggle,
    children,
}: {
    label: string;
    on: boolean;
    onToggle: (on: boolean) => void;
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-h-8 items-center gap-3">
            <label className="flex w-40 shrink-0 items-center gap-2 text-sm text-stone-600">
                <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => onToggle(e.target.checked)}
                    className="cursor-pointer"
                />
                {label}
            </label>
            {/* unchecked shows no control at all, so there is nothing to fiddle
                with that wouldn't be sent */}
            {on ? children : <span className="text-xs text-stone-400">Inherits from storefront</span>}
        </div>
    );
}

export default function BlockStyleForm({
    value,
    onChange,
}: {
    value: PageBlockStyle;
    onChange: (style: PageBlockStyle) => void;
}) {
    // The schema forbids partial style objects, so every control emits the whole
    // thing — same contract as StyleSelector.
    const set = <K extends keyof PageBlockStyle>(key: K, next: PageBlockStyle[K]) =>
        onChange({ ...value, [key]: next });

    return (
        <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium text-stone-700">Style overrides</legend>

            <Override
                label="Background"
                on={value.background_color !== null}
                onToggle={(on) => set("background_color", on ? SEEDS.background_color : null)}
            >
                <input
                    type="color"
                    value={value.background_color ?? SEEDS.background_color}
                    onChange={(e) => set("background_color", e.target.value)}
                    className="h-8 w-12 cursor-pointer rounded border border-stone-300"
                />
            </Override>

            <Override
                label="Text colour"
                on={value.font_color !== null}
                onToggle={(on) => set("font_color", on ? SEEDS.font_color : null)}
            >
                <input
                    type="color"
                    value={value.font_color ?? SEEDS.font_color}
                    onChange={(e) => set("font_color", e.target.value)}
                    className="h-8 w-12 cursor-pointer rounded border border-stone-300"
                />
            </Override>

            <Override
                label="Font"
                on={value.font_family !== null}
                onToggle={(on) => set("font_family", on ? SEEDS.font_family : null)}
            >
                <select
                    value={value.font_family ?? SEEDS.font_family}
                    onChange={(e) => set("font_family", e.target.value as FontFamily)}
                    className="cursor-pointer rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 focus:outline-none"
                >
                    {FONT_FAMILIES.map((font) => (
                        <option key={font} value={font}>
                            {font}
                        </option>
                    ))}
                </select>
            </Override>

            <Override
                label="Font scale"
                on={value.font_scale !== null}
                onToggle={(on) => set("font_scale", on ? SEEDS.font_scale : null)}
            >
                <input
                    type="range"
                    min={0.5}
                    max={3}
                    step={0.1}
                    value={value.font_scale ?? SEEDS.font_scale}
                    onChange={(e) => set("font_scale", Number(e.target.value))}
                    className="w-40 cursor-pointer"
                />
            </Override>

            <Override
                label="Line spacing"
                on={value.line_spacing !== null}
                onToggle={(on) => set("line_spacing", on ? SEEDS.line_spacing : null)}
            >
                <input
                    type="range"
                    min={0.5}
                    max={3}
                    step={0.1}
                    value={value.line_spacing ?? SEEDS.line_spacing}
                    onChange={(e) => set("line_spacing", Number(e.target.value))}
                    className="w-40 cursor-pointer"
                />
            </Override>

            <Override
                label="Padding"
                on={value.padding !== null}
                onToggle={(on) => set("padding", on ? SEEDS.padding : null)}
            >
                <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={value.padding ?? SEEDS.padding}
                    onChange={(e) => set("padding", Number(e.target.value))}
                    className="w-40 cursor-pointer"
                />
            </Override>

            {/* Alignment has no override toggle: unlike the rest it is never
                null on the way out, so there is no inherit state to express. */}
            <div className="flex min-h-8 items-center gap-3">
                <span className="w-40 shrink-0 text-sm text-stone-600">Alignment</span>
                <select
                    value={value.alignment}
                    onChange={(e) => set("alignment", e.target.value as Alignment)}
                    className="cursor-pointer rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 capitalize focus:outline-none"
                >
                    {ALIGNMENTS.map((alignment) => (
                        <option key={alignment} value={alignment}>
                            {alignment}
                        </option>
                    ))}
                </select>
            </div>
        </fieldset>
    );
}
