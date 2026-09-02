'use client';

import { useEffect, useRef } from "react";
import Button from "@/components/button";
import RichText from "@/components/richText";

// One prefix, whichever kind — used to strip before re-prefixing so a line can
// never end up carrying two markers.
const LIST_PREFIX = /^(?:- |\d+\. )/;
const BULLET = /^- /;
const NUMBERED = /^\d+\. /;

export default function TextField({
    value,
    onChange,
}: {
    value: string;
    onChange: (next: string) => void;
}) {
    const areaRef = useRef<HTMLTextAreaElement>(null);
    // A controlled textarea drops the caret to the end on every change, so each
    // edit records where the selection should land once React has re-rendered.
    const pending = useRef<[number, number] | null>(null);

    useEffect(() => {
        const range = pending.current;
        const area = areaRef.current;
        if (range === null || area === null) return;

        pending.current = null;
        area.focus();
        area.setSelectionRange(range[0], range[1]);
    }, [value]);

    const apply = (next: string, start: number, end: number) => {
        pending.current = [start, end];
        onChange(next);
    };

    // Start of the line the offset sits on. lastIndexOf clamps a negative
    // position to 0 and would match a leading newline, so offset 0 is special.
    const lineStart = (offset: number) =>
        offset === 0 ? 0 : value.lastIndexOf("\n", offset - 1) + 1;

    const wrap = (marker: string) => {
        const area = areaRef.current;
        if (area === null) return;

        const { selectionStart: start, selectionEnd: end } = area;
        const selected = value.slice(start, end);
        const width = marker.length;

        // Already formatted, with the markers inside the selection — unwrap.
        if (
            selected.length > 2 * width &&
            selected.startsWith(marker) &&
            selected.endsWith(marker)
        ) {
            const bare = selected.slice(width, -width);
            apply(value.slice(0, start) + bare + value.slice(end), start, start + bare.length);
            return;
        }

        // Already formatted, but the user selected only the words between the
        // markers — the common case when re-clicking B on a bolded phrase.
        if (
            start >= width &&
            value.slice(start - width, start) === marker &&
            value.slice(end, end + width) === marker
        ) {
            apply(
                value.slice(0, start - width) + selected + value.slice(end + width),
                start - width,
                end - width,
            );
            return;
        }

        apply(
            value.slice(0, start) + marker + selected + marker + value.slice(end),
            start + width,
            end + width,
        );
    };

    const toggleList = (ordered: boolean) => {
        const area = areaRef.current;
        if (area === null) return;

        // Widened to whole lines: a prefix belongs to the line, not to whatever
        // fragment of it happens to be selected.
        const from = lineStart(area.selectionStart);
        const break_ = value.indexOf("\n", area.selectionEnd);
        const to = break_ === -1 ? value.length : break_;

        const lines = value.slice(from, to).split("\n");
        const marker = ordered ? NUMBERED : BULLET;
        // Turning it off only when every line already has it means a partial
        // selection completes the list rather than clearing it.
        const on = lines.every((line) => marker.test(line));

        const rewritten = lines
            .map((line, index) => {
                const bare = line.replace(LIST_PREFIX, "");
                if (on) return bare;
                return ordered ? `${index + 1}. ${bare}` : `- ${bare}`;
            })
            .join("\n");

        apply(
            value.slice(0, from) + rewritten + value.slice(to),
            from,
            from + rewritten.length,
        );
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        const { selectionStart: start, selectionEnd: end } = event.currentTarget;
        if (event.key !== "Enter" || event.shiftKey || start !== end) return;

        const from = lineStart(start);
        const prefix = LIST_PREFIX.exec(value.slice(from, start))?.[0];
        if (prefix === undefined) return;

        event.preventDefault();

        // An empty item is how you leave a list.
        if (start === from + prefix.length) {
            apply(value.slice(0, from) + value.slice(start), from, from);
            return;
        }

        const next = NUMBERED.test(prefix)
            ? `\n${Number.parseInt(prefix, 10) + 1}. `
            : `\n${prefix}`;
        const caret = start + next.length;
        apply(value.slice(0, start) + next + value.slice(start), caret, caret);
    };

    return (
        <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-stone-700">Text</span>

            <div className="flex flex-wrap gap-2">
                <Button
                    variant="chip"
                    title="Bold"
                    aria-label="Bold"
                    className="w-9 font-bold"
                    onClick={() => wrap("**")}
                >
                    B
                </Button>
                <Button
                    variant="chip"
                    title="Underline"
                    aria-label="Underline"
                    className="w-9 underline"
                    onClick={() => wrap("*")}
                >
                    U
                </Button>
                <Button
                    variant="chip"
                    title="Italic"
                    aria-label="Italic"
                    className="w-9 italic"
                    onClick={() => wrap("_")}
                >
                    I
                </Button>
                <Button
                    variant="chip"
                    title="Bulleted list"
                    aria-label="Bulleted list"
                    className="w-9"
                    onClick={() => toggleList(false)}
                >
                    •
                </Button>
                <Button
                    variant="chip"
                    title="Numbered list"
                    aria-label="Numbered list"
                    className="w-9"
                    onClick={() => toggleList(true)}
                >
                    1.
                </Button>
            </div>

            <textarea
                ref={areaRef}
                value={value}
                rows={5}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Write something…"
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none"
            />

            {/* The textarea shows the markers, so the formatting itself is only
                visible here — without it the toolbar has no feedback. */}
            <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800">
                {value.trim().length > 0 ? (
                    <RichText text={value} />
                ) : (
                    <span className="text-stone-400">Preview</span>
                )}
            </div>
        </div>
    );
}
