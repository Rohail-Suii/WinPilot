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
  metadataBase: new URL(process.env.NEXTAUTH_URL || "https://inpilot.app"),
  title: {
    default: "InPilot — LinkedIn Automation For Developers",
    template: "%s — InPilot",
  },
  description:
    "Automate LinkedIn job applications, profile scraping, and post scheduling with a command-first platform built for developers.",
  keywords: [
    "LinkedIn automation",
    "job application automation",
    "LinkedIn scraper",
    "post scheduling automation",
    "developer growth tools",
  ],
  openGraph: {
    title: "InPilot — LinkedIn Automation For Developers",
    description:
      "Automate applications, scraping, and posting on LinkedIn with a command-first workflow.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "InPilot — LinkedIn Automation For Developers",
    description:
      "Automate applications, scraping, and post scheduling on LinkedIn with InPilot.",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#0A0A0A] text-white`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
