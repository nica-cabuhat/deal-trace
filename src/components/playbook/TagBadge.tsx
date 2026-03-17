import type { EmailTag } from "@/lib/types/thread";

const CATEGORY_STYLES: Record<EmailTag["category"], string> = {
  engagement: "bg-blue-100 text-blue-700 ring-blue-200",
  urgency: "bg-red-100 text-red-700 ring-red-200",
  sentiment: "bg-amber-100 text-amber-700 ring-amber-200",
  intent: "bg-purple-100 text-purple-700 ring-purple-200",
};

export default function TagBadge({ tag }: { tag: EmailTag }) {
  const styles = CATEGORY_STYLES[tag.category];
  const confidence = Math.round(tag.confidence * 100);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${styles}`}
      title={`${tag.category} · ${confidence}% confidence`}
    >
      {tag.signal}
      <span className="opacity-60">{confidence}%</span>
    </span>
  );
}
