import type { EmailTag } from "@/lib/types/thread";

interface TagStyle {
  background: string;
  color: string;
  ringColor: string;
}

function getTagStyles(
  direction: EmailTag["direction"],
  confidence: number,
): TagStyle {
  if (direction === "neutral") {
    return {
      background: "var(--color-gray-100)",
      color: "var(--color-gray-550)",
      ringColor: "var(--color-gray-300)",
    };
  }
  if (direction === "negative") {
    if (confidence >= 0.7)
      return {
        background: "var(--color-danger)",
        color: "var(--color-orange-500)",
        ringColor: "var(--color-orange-300)",
      };
    if (confidence >= 0.4)
      return {
        background: "var(--color-warning)",
        color: "var(--color-orange-400)",
        ringColor: "var(--color-orange-200)",
      };
    return {
      background: "var(--color-gray-100)",
      color: "var(--color-gray-550)",
      ringColor: "var(--color-gray-300)",
    };
  }
  // positive
  if (confidence >= 0.7)
    return {
      background: "var(--color-success)",
      color: "var(--color-green-500)",
      ringColor: "var(--color-green-300)",
    };
  if (confidence >= 0.4)
    return {
      background: "var(--color-primary)",
      color: "var(--color-blue-400)",
      ringColor: "var(--color-blue-300)",
    };
  return {
    background: "var(--color-gray-100)",
    color: "var(--color-gray-550)",
    ringColor: "var(--color-gray-300)",
  };
}

export default function TagBadge({ tag }: { tag: EmailTag }) {
  const confidence = Math.round(tag.confidence * 100);
  const styles = getTagStyles(tag.direction, tag.confidence);

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{
        background: styles.background,
        color: styles.color,
        boxShadow: `inset 0 0 0 1px ${styles.ringColor}`,
      }}
      title={`${tag.category} · ${tag.direction} · ${confidence}% confidence`}
    >
      {tag.signal}
      <span className="opacity-60">{confidence}%</span>
    </span>
  );
}
