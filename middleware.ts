import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

const GUEST_COOKIE = "guestId";

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth?.user;

  // For unauthenticated /dashboard visitors, set a guest UUID cookie so API routes
  // can lazily create a GuestSession and associate data with it.
  if (nextUrl.pathname.startsWith("/dashboard") && !isLoggedIn) {
    const existing = req.cookies.get(GUEST_COOKIE)?.value;
    if (!existing) {
      const res = NextResponse.next();
      res.cookies.set(GUEST_COOKIE, crypto.randomUUID(), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 48 * 60 * 60, // 48 hours
      });
      return res;
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/login",
    "/register",
    "/verify-email",
    "/forgot-password",
    "/reset-password",
    "/api/:path*",
  ],
};
