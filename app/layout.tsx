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
  metadataBase: new URL(process.env.NEXTAUTH_URL || "https://inpilot.dev"),
  title: {
    default: "InPilot — LinkedIn Automation for Developers",
    template: "%s — InPilot",
  },
  description:
    "Automate your LinkedIn presence. Job applications, profile scraping, and post scheduling for developers and founders who hate clicking.",
  keywords: [
    "LinkedIn automation",
    "job application automation",
    "LinkedIn API",
    "developer tools",
    "LinkedIn scraper",
    "post scheduler",
  ],
  openGraph: {
    title: "InPilot — LinkedIn Automation for Developers",
    description:
      "Automate job applications, scraping, and posting on LinkedIn. One SDK. Full control.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "InPilot — LinkedIn Automation for Developers",
    description:
      "Stop clicking. Start automating. LinkedIn, on your terms.",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[var(--bg-primary)] text-[var(--text-primary)]`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
