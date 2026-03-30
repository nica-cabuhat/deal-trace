import Script from "next/script";

/**
 * Load hosted Office.js after hydration. `beforeInteractive` in a nested layout
 * can misbehave in embedded hosts; `useMailboxConversation` polls until `Office` exists.
 */
export default function TaskpaneLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script
        id="office-js-hosted"
        src="https://appsforoffice.microsoft.com/lib/1/hosted/office.js"
        strategy="afterInteractive"
      />
      {children}
    </>
  );
}
