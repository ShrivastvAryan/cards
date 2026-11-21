import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  title: { default: "Taash — Card games with friends", template: "%s · Taash" },
  description: "Teen Patti, Bluff and Color Rush. Create a table as a guest, share the link, play with friends or the computer.",
  applicationName: "Taash",
  appleWebApp: { capable: true, title: "Taash", statusBarStyle: "black" },
  openGraph: {
    title: "Taash — Join my table",
    description: "Teen Patti, Bluff & Color Rush. No sign-up: open the link, pick a guest name and play.",
    siteName: "Taash",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0b1210",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col w-full max-w-[600px] mx-auto">{children}</body>
    </html>
  );
}
