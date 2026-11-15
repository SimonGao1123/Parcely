// Colours fixed rather than themed: a warning has to read as a warning on every
// storefront, whatever its palette.
const TONES = {
    good: "border-green-300 bg-green-50 text-green-800",
    warn: "border-amber-300 bg-amber-50 text-amber-800",
    muted: "border-stone-300 bg-stone-100 text-stone-600",
} as const;

export default function StatusBadge({
    label,
    tone,
}: {
    label: string;
    tone: keyof typeof TONES;
}) {
    return <span className={`rounded-full border px-2.5 py-0.5 text-xs ${TONES[tone]}`}>{label}</span>;
}
