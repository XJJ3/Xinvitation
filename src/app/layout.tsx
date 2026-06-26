import type { Metadata } from "next";
import localFont from "next/font/local";
import { siteConfig } from "@/config/site";
import "./globals.css";

// 英文装饰字：EB Garamond（16 世纪人文主义衬线，古典优雅），本地自托管
const ebGaramond = localFont({
  variable: "--font-serif-en",
  display: "swap",
  src: [
    {
      path: "../../public/fonts/ebgaramond-regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/ebgaramond-italic.woff2",
      weight: "400",
      style: "italic",
    },
  ],
});

// 中文标题/诗句字：汇文明朝体（CC0，古典明朝体衬线），已子集化为 woff2
const huiwen = localFont({
  variable: "--font-mincho",
  display: "swap",
  src: "../../public/fonts/huiwen-mincho-subset.woff2",
  weight: "400",
});

// 中文人名/正文字：霞鹜文楷（OFL，书法楷体半衬线），已子集化为 woff2
const wenkai = localFont({
  variable: "--font-kai",
  display: "swap",
  src: "../../public/fonts/lxgw-wenkai-subset.woff2",
  weight: "400",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: siteConfig.share.title,
  description: siteConfig.share.description,
  // 微信分享卡片：标题/描述在此声明；缩略图由同目录 opengraph-image.tsx
  // 自动生成并注入为 og:image（绝对地址依赖 metadataBase，即 siteConfig.url）。
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
      className={`${ebGaramond.variable} ${huiwen.variable} ${wenkai.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
