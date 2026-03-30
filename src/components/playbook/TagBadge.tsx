import type { EmailTag } from "@/lib/types/thread";

function getTagStyles(direction: EmailTag["direction"], confidence: number): string {
  if (direction === "neutral") return "bg-gray-100 text-gray-600 ring-gray-200";
  if (direction === "negative") {
    if (confidence >= 0.7) return "bg-red-100 text-red-700 ring-red-200";
    if (confidence >= 0.4) return "bg-orange-100 text-orange-700 ring-orange-200";
    return "bg-yellow-100 text-yellow-700 ring-yellow-200";
  }
  // positive
  if (confidence >= 0.7) return "bg-green-100 text-green-700 ring-green-200";
  if (confidence >= 0.4) return "bg-blue-100 text-blue-700 ring-blue-200";
  return "bg-purple-100 text-purple-700 ring-purple-200";
}

export default function TagBadge({ tag }: { tag: EmailTag }) {
  const confidence = Math.round(tag.confidence * 100);
  const styles = getTagStyles(tag.direction, tag.confidence);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${styles}`}
      title={`${tag.category} · ${tag.direction} · ${confidence}% confidence`}
    >
      {tag.signal}
      <span className="opacity-60">{confidence}%</span>
    </span>
  );
}
