import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Script from "next/script";
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
  metadataBase: new URL(process.env.NEXTAUTH_URL || "https://winpilot.tech"),
  title: {
    default: "WinPilot — LinkedIn Job Automation | Auto Apply to LinkedIn Jobs",
    template: "%s | WinPilot",
  },
  description:
    "WinPilot automatically applies to LinkedIn jobs for you. The #1 LinkedIn job automation tool — auto-fill Easy Apply forms, AI resume tailoring, and apply to 100+ jobs per day hands-free.",
  keywords: [
    "LinkedIn job automation",
    "automatic job apply LinkedIn",
    "auto apply LinkedIn jobs",
    "LinkedIn Easy Apply automation",
    "automated job application tool",
    "LinkedIn job bot",
    "apply to jobs automatically on LinkedIn",
    "LinkedIn automation tool",
    "job application automation software",
    "bulk apply LinkedIn",
    "LinkedIn auto apply extension",
    "AI job application",
    "LinkedIn scraper",
    "job search automation",
    "automatic LinkedIn job apply",
  ],
  openGraph: {
    title: "WinPilot — Auto Apply to LinkedIn Jobs Automatically",
    description:
      "Stop manually applying to jobs. WinPilot automates your entire LinkedIn job search — AI resume tailoring, auto-fill Easy Apply forms, and 100+ applications per day.",
    type: "website",
    locale: "en_US",
    url: "https://winpilot.tech",
    siteName: "WinPilot",
  },
  twitter: {
    card: "summary_large_image",
    title: "WinPilot — LinkedIn Job Automation",
    description:
      "Automatically apply to LinkedIn jobs with AI. Auto-fill Easy Apply forms, tailor resumes per job, and apply to 100+ jobs per day.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: "https://winpilot.tech",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "WinPilot",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, Chrome Extension",
    url: "https://winpilot.tech",
    description:
      "WinPilot automatically applies to LinkedIn jobs for you. Auto-fill Easy Apply forms, AI resume tailoring, and apply to 100+ jobs per day.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    featureList: [
      "LinkedIn Job Automation",
      "Auto Apply LinkedIn Easy Apply",
      "AI Resume Tailoring",
      "LinkedIn Profile Scraper",
      "Automated Job Applications",
      "Bulk Job Apply",
    ],
  };

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#0A0A0A] text-white`}
        suppressHydrationWarning
      >
        <Providers>{children}</Providers>
        <SpeedInsights />
        {process.env.NEXT_PUBLIC_GA_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`}
              strategy="afterInteractive"
            />
            <Script
              id="ga-init"
              strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  gtag('config', '${process.env.NEXT_PUBLIC_GA_ID}');
                `,
              }}
            />
          </>
        )}
      </body>
    </html>
  );
}
