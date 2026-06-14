import type { Metadata } from "next";
import { Cormorant_Infant } from "next/font/google";
import { siteConfig } from "@/config/site";
import "./globals.css";

const cormorant = Cormorant_Infant({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: siteConfig.share.title,
  description: siteConfig.share.description,
  openGraph: {
    type: "website",
    title: siteConfig.share.title,
    description: siteConfig.share.description,
    url: siteConfig.url,
    images: [
      {
        url: siteConfig.share.image,
        width: 1200,
        height: 630,
        alt: siteConfig.share.title,
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${cormorant.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
