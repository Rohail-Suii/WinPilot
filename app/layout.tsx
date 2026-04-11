import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL || "https://linkedboost.app"),
  title: {
    default: "LinkedBoost — LinkedIn Automation That Goes Viral",
    template: "%s — LinkedBoost",
  },
  description:
    "The best free LinkedIn automation tool. Auto-apply to jobs, build your personal brand, and scrape leads — all with your own AI keys.",
  keywords: [
    "LinkedIn automation",
    "job application bot",
    "LinkedIn Easy Apply",
    "personal branding",
    "LinkedIn scraper",
  ],
  openGraph: {
    title: "LinkedBoost — LinkedIn Automation That Goes Viral",
    description:
      "Auto-apply to jobs, build your personal brand, and scrape leads on LinkedIn — completely free with BYOK AI.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "LinkedBoost — LinkedIn Automation That Goes Viral",
    description:
      "Auto-apply to jobs, build your personal brand, and scrape leads on LinkedIn — completely free.",
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: "/",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-var(--bg-primary) text-var(--text-primary)`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
