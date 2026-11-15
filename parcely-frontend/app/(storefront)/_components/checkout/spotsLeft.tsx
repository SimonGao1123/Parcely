// No directive — used from both server pages and the client ProductBlock.

// "3 of 10 spots left". Nothing for an uncapped or one-time product, whose
// spots_left is null.
export default function SpotsLeft({
    spotsLeft,
    maxCapacity,
    className = "",
}: {
    spotsLeft: number | null | undefined;
    maxCapacity: number | null;
    className?: string;
}) {
    if (spotsLeft === null || spotsLeft === undefined || maxCapacity === null) return null;

    return (
        <p className={`opacity-70 ${className}`}>
            {spotsLeft === 0
                ? "No spots left"
                : `${spotsLeft} of ${maxCapacity} spot${maxCapacity === 1 ? "" : "s"} left`}
        </p>
    );
}
