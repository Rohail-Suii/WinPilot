import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

// Edge-compatible auth config (no Node.js imports like mongoose/bcrypt).
// Used by middleware. The full auth.ts extends this with the authorize callback.
export const authConfig = {
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      // authorize is defined in auth.ts (Node.js runtime only)
    }),
    ...(process.env.GOOGLE_CLIENT_ID
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          }),
        ]
      : []),
  ],
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days
    updateAge: 24 * 60 * 60, // Force session update every 24 hours
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = nextUrl;

      // Protect dashboard routes
      if (pathname.startsWith("/dashboard")) {
        return isLoggedIn;
      }

      // Redirect authenticated users away from auth pages
      if (isLoggedIn && (pathname === "/login" || pathname === "/register")) {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }

      return true;
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.iat = Math.floor(Date.now() / 1000);
      }
      if (trigger === "update" && session) {
        token.name = session.name;
        token.image = session.image;
      }
      // Rotate token every 24 hours
      const iat = (token.iat as number) || 0;
      const now = Math.floor(Date.now() / 1000);
      if (now - iat > 24 * 60 * 60) {
        token.iat = now;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
