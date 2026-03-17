"use client";

import { useSession, signIn } from "next-auth/react";
import { useEffect } from "react";

export default function TaskpanePage() {
  const { status } = useSession();

  useEffect(() => {
    if (status === "unauthenticated") {
      signIn("azure-ad");
    }
  }, [status]);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <main className="p-4">
        <h1 className="text-lg font-semibold">DealTrace</h1>
        <p className="text-sm text-gray-500">Signing in...</p>
      </main>
    );
  }

  return (
    <main className="p-4">
      <h1 className="text-lg font-semibold">DealTrace</h1>
      <p className="text-sm text-gray-500">Loading add-in...</p>
    </main>
  );
}
