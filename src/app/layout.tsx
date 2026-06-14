import type { Metadata } from "next";
import localFont from "next/font/local";
import { siteConfig } from "@/config/site";
import "./globals.css";

// 本地自托管 Cormorant Infant（latin 子集），避免构建机访问 Google Fonts 失败
const cormorant = localFont({
  variable: "--font-cormorant",
  display: "swap",
  src: [
    {
      path: "../../public/fonts/cormorant-infant-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/cormorant-infant-latin-400-italic.woff2",
      weight: "400",
      style: "italic",
    },
  ],
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
