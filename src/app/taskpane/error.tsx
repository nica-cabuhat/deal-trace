"use client";

/**
 * Surfaces render errors in the add-in instead of a blank Next.js error shell.
 */
export default function TaskpaneError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      className="flex min-h-screen flex-col gap-3 p-4 text-sm"
      style={{ background: "var(--color-gray-50)", color: "var(--color-gray-800)" }}
    >
      <p className="font-semibold">DealTrace couldn’t load in this pane.</p>
      <p style={{ color: "var(--color-gray-600)" }}>
        {error.message || "Something went wrong. Try closing and reopening the add-in."}
      </p>
      <button
        type="button"
        className="self-start rounded-md border px-3 py-1.5 text-xs font-medium"
        style={{ borderColor: "var(--color-sophos-blue)", color: "var(--color-sophos-blue)" }}
        onClick={() => reset()}
      >
        Try again
      </button>
    </div>
  );
}
