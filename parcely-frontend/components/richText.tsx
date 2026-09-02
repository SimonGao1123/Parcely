// No 'use client': this is a pure render, so it works both in the storefront's
// server components and inside the editor modal.

import type { ReactNode } from "react";

// The alternation is ordered so "**x**" is read as bold rather than as an empty
// underline pair followed by a stray marker. Underline takes the single "*" that
// markdown spends on italic, so italic moves to "_".
const INLINE = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|_([^_\n]+)_/g;

const BULLET = /^- (.*)$/;
const NUMBERED = /^\d+\. (.*)$/;

function inline(text: string): ReactNode[] {
    const nodes: ReactNode[] = [];
    let cursor = 0;

    for (const match of text.matchAll(INLINE)) {
        const [marked, bold, underline, italic] = match;
        const at = match.index;

        if (at > cursor) nodes.push(text.slice(cursor, at));

        if (bold !== undefined) nodes.push(<strong key={at}>{bold}</strong>);
        else if (underline !== undefined) nodes.push(<u key={at}>{underline}</u>);
        else nodes.push(<em key={at}>{italic}</em>);

        cursor = at + marked.length;
    }

    if (cursor < text.length) nodes.push(text.slice(cursor));
    return nodes;
}

type Run =
    | { type: "list"; ordered: boolean; items: string[] }
    | { type: "text"; lines: string[] };

// Consecutive list lines collapse into one list; everything else accumulates
// into a run of plain lines that is rejoined with its newlines intact.
function group(text: string): Run[] {
    const runs: Run[] = [];

    for (const line of text.split("\n")) {
        const bullet = BULLET.exec(line);
        const numbered = bullet ? null : NUMBERED.exec(line);
        const item = bullet ?? numbered;
        const open = runs.at(-1);

        if (item) {
            const ordered = numbered !== null;
            // a bullet run and a numbered run are different lists even when adjacent
            if (open?.type === "list" && open.ordered === ordered) open.items.push(item[1]);
            else runs.push({ type: "list", ordered, items: [item[1]] });
        } else if (open?.type === "text") {
            open.lines.push(line);
        } else {
            runs.push({ type: "text", lines: [line] });
        }
    }

    return runs;
}

export default function RichText({ text }: { text: string }) {
    return (
        <>
            {group(text).map((run, index) => {
                // Runs are positional slices of one string, so the index is their identity.
                if (run.type === "text") {
                    return (
                        // pre-wrap is what keeps blank lines and soft breaks visible
                        <p key={index} className="whitespace-pre-wrap">
                            {inline(run.lines.join("\n"))}
                        </p>
                    );
                }

                const items = run.items.map((item, i) => <li key={i}>{inline(item)}</li>);

                // Tailwind's preflight strips markers and padding off ul/ol, so both
                // have to be asked for. Inside rather than outside: the marker then
                // follows the block's alignment and can't fall into the overflow clip.
                return run.ordered ? (
                    <ol key={index} className="list-inside list-decimal">
                        {items}
                    </ol>
                ) : (
                    <ul key={index} className="list-inside list-disc">
                        {items}
                    </ul>
                );
            })}
        </>
    );
}
