"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useEffect, useState } from "react";

/**
 * NextAuth `SessionProvider` is omitted here: it subscribes to `storage`,
 * `visibilitychange`, and hits `/api/auth/session` on mount. Outlook’s task-pane
 * WebView often has a restricted Storage / History surface and those paths throw
 * or hard-fail. Nothing in the app tree uses `useSession` today; API routes still
 * use `getServerSession` on the server. Re-wrap auth UI with `SessionProvider`
 * only where sign-in flows live (not the add-in shell).
 */
function SafeReactQueryDevtools() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        const h = window.history;
        if (
          process.env.NODE_ENV === "development" &&
          typeof h?.replaceState === "function" &&
          typeof h.pushState === "function"
        ) {
          setShow(true);
        }
      } catch {
        /* Outlook WebView may expose a broken History API */
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  if (!show) return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <SafeReactQueryDevtools />
    </QueryClientProvider>
  );
}
