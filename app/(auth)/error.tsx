"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Auth error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="rounded-xl border border-[#1A1A1A] bg-[#111111] p-8">
        <h2 className="text-2xl font-semibold text-white tracking-tight">
          Something went wrong
        </h2>
        <p className="mt-2 text-sm text-[#888888]">
          We ran into an issue. Please try again.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-lg bg-[#00E5FF] px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-[#53EDFF]"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-lg border border-[#222222] px-4 py-2 text-sm font-medium text-[#888888] transition-colors hover:bg-[#1A1A1A] hover:border-[#333333]"
          >
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
