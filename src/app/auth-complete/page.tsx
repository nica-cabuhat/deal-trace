"use client";

import { useEffect } from "react";

export default function AuthCompletePage() {
  useEffect(() => {
    window.close();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm" style={{ color: "var(--color-gray-500)" }}>
        Sign-in complete. You can close this window.
      </p>
    </div>
  );
}
