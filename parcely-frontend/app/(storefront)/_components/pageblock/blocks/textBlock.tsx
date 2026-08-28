import type { TextBlock as TextBlockData } from "@/types/block";

export default function TextBlock({ block }: { block: TextBlockData }) {
    // resolved_content is identical to content for text blocks
    return <p className="whitespace-pre-wrap">{block.content.text}</p>;
}
