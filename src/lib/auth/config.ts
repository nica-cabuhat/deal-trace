import AzureADProvider from "next-auth/providers/azure-ad";
import type { NextAuthOptions } from "next-auth";
import { env } from "@/lib/schemas/env.schema";

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
  events: {
    async signIn(message) {
      console.log("[signIn event]", message);
    },
    async session(message) {
      console.log("[session event]", message);
    },
  },
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
  pages: {
    signIn: "/taskpane",
  },
  logger: {
    error(code, metadata) {
      console.error("[nextauth error]", code, metadata);
    },
    warn(code) {
      console.warn("[nextauth warn]", code);
    },
  },
  debug: true,
};
