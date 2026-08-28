import type { ProductBlock as ProductBlockData } from "@/types/block";

// Intentionally empty: product rendering is a separate task. Kept so the switch
// in block.tsx stays exhaustive over BlockKind.
export default function ProductBlock({ block }: { block: ProductBlockData }) {
    void block;
    return null;
}
