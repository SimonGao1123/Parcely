import RichText from "@/components/richText";
import type { TextBlock as TextBlockData } from "@/types/block";

export default function TextBlock({ block }: { block: TextBlockData }) {
    // resolved_content is identical to content for text blocks
    return <RichText text={block.content.text} />;
}
