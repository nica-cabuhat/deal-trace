import AzureADProvider from "next-auth/providers/azure-ad";
import type { NextAuthOptions } from "next-auth";
import { env } from "@/lib/schemas/env.schema";

/**
 * All cookies use SameSite=None so the session set during popup sign-in
 * is accessible from the Outlook iframe (third-party context).
 */
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "none" as const,
  secure: true,
  path: "/",
};

export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId: env.AZURE_AD_CLIENT_ID,
      clientSecret: env.AZURE_AD_CLIENT_SECRET,
      tenantId: env.AZURE_AD_TENANT_ID,
      authorization: {
        params: {
          scope: `openid profile email ${env.GRAPH_SCOPE}`,
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token ?? "";
        token.expiresAt = account.expires_at ?? 0;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      return session;
    },
  },
  session: {
    strategy: "jwt",
  },
  cookies: {
    sessionToken: {
      name: "__Secure-next-auth.session-token",
      options: COOKIE_OPTS,
    },
    callbackUrl: {
      name: "__Secure-next-auth.callback-url",
      options: COOKIE_OPTS,
    },
    csrfToken: {
      name: "__Host-next-auth.csrf-token",
      options: COOKIE_OPTS,
    },
  },
  debug: process.env.NODE_ENV === "development",
};
