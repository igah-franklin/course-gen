import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { publicEnv } from "@/lib/env";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.siteUrl),
  title: {
    default: `${publicEnv.appName} — Turn any YouTube video into a complete course`,
    template: `%s · ${publicEnv.appName}`,
  },
  description:
    "Transform YouTube tutorials into structured lessons, detailed explanations, illustrations, practical exercises and assessments — powered by AI.",
  openGraph: {
    type: "website",
    siteName: publicEnv.appName,
    title: "Turn any YouTube video into a complete course",
    description:
      "Structured lessons, step-by-step instructions, illustrations, quizzes and certificates generated from any educational YouTube video.",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
