import AzureADProvider from "next-auth/providers/azure-ad";
import type { NextAuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { env } from "@/lib/schemas/env.schema";

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "none" as const,
  secure: true,
  path: "/",
};

async function refreshAccessToken(token: JWT): Promise<JWT> {
  const params = new URLSearchParams({
    client_id: env.AZURE_AD_CLIENT_ID,
    client_secret: env.AZURE_AD_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: token.refreshToken,
    scope: `openid profile email offline_access ${env.GRAPH_SCOPE}`,
  });

  const res = await fetch(
    `https://login.microsoftonline.com/${env.AZURE_AD_TENANT_ID}/oauth2/v2.0/token`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params },
  );

  const data = await res.json();

  if (!res.ok) {
    console.error("[auth] Token refresh failed", data);
    return { ...token, error: "RefreshTokenError" as const };
  }

  return {
    ...token,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? token.refreshToken,
    expiresAt: Math.floor(Date.now() / 1000) + (data.expires_in as number),
    error: undefined,
  };
}

export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId: env.AZURE_AD_CLIENT_ID,
      clientSecret: env.AZURE_AD_CLIENT_SECRET,
      tenantId: env.AZURE_AD_TENANT_ID,
      authorization: {
        params: {
          scope: `openid profile email offline_access ${env.GRAPH_SCOPE}`,
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        return {
          ...token,
          accessToken: account.access_token ?? "",
          refreshToken: account.refresh_token ?? "",
          expiresAt: account.expires_at ?? 0,
        };
      }

      // Token still valid — return as-is
      if (Date.now() < token.expiresAt * 1000 - 60_000) {
        return token;
      }

      // Token expired or about to expire — refresh it
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.error = token.error;
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
