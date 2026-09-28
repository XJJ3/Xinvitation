import type { Metadata } from "next";
import { Ma_Shan_Zheng, Noto_Serif_SC, Lato, Cormorant_Garamond } from "next/font/google";
import { siteConfig } from "@/config/site";
import "./globals.css";

// 中文书法标题字：马善政毛笔楷书（Google Fonts，构建时自托管）
const brush = Ma_Shan_Zheng({
  weight: "400",
  variable: "--font-brush",
  display: "swap",
  preload: false,
});

// 中文正文衬线：思源宋体（Google Fonts）
const serif = Noto_Serif_SC({
  weight: ["400", "600", "700"],
  variable: "--font-serif",
  display: "swap",
  preload: false,
});

// 西文无衬线：Lato
const sans = Lato({
  weight: ["300", "400", "700"],
  variable: "--font-sans",
  display: "swap",
  subsets: ["latin"],
});

// 西文标题衬线：Cormorant Garamond（请帖各模块的英文小标题）
const en = Cormorant_Garamond({
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-en",
  display: "swap",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: siteConfig.share.title,
  description: siteConfig.share.description,
  // 微信分享卡片：标题/描述在此声明；缩略图是同目录 opengraph-image.jpg，
  // Next 自动注入为 og:image（绝对地址依赖 metadataBase，即 siteConfig.url）。
  openGraph: {
    type: "website",
    title: siteConfig.share.title,
    description: siteConfig.share.description,
    url: siteConfig.url,
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
      className={`${brush.variable} ${serif.variable} ${sans.variable} ${en.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
