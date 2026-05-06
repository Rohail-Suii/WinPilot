"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        className="bg-[#0A0F1C] text-white"
        style={{ backgroundColor: "#0A0F1C", color: "#ffffff", margin: 0 }}
      >
        <div
          style={{
            display: "flex",
            minHeight: "100vh",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1.5rem",
            padding: "1rem",
            textAlign: "center",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          <div
            style={{
              borderRadius: "0.75rem",
              border: "1px solid rgba(255,255,255,0.1)",
              backgroundColor: "rgba(255,255,255,0.05)",
              padding: "2rem",
            }}
          >
            <h2 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>
              Something went wrong
            </h2>
            <p
              style={{
                marginTop: "0.5rem",
                fontSize: "0.875rem",
                color: "rgba(255,255,255,0.6)",
              }}
            >
              A critical error occurred. Please try again.
            </p>
            <div
              style={{
                marginTop: "1.5rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.75rem",
              }}
            >
              <button
                onClick={reset}
                style={{
                  borderRadius: "0.5rem",
                  backgroundColor: "#2563eb",
                  padding: "0.5rem 1rem",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  color: "#ffffff",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Try again
              </button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/"
                style={{
                  borderRadius: "0.5rem",
                  border: "1px solid rgba(255,255,255,0.1)",
                  padding: "0.5rem 1rem",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  color: "rgba(255,255,255,0.8)",
                  textDecoration: "none",
                  cursor: "pointer",
                }}
              >
                Go Home
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
