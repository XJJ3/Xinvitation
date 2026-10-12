import type { Metadata, Viewport } from "next";
import { Ma_Shan_Zheng, Noto_Serif_SC, Lato, Cormorant_Garamond } from "next/font/google";
import { siteConfig } from "@/config/site";
import { FONT_SCALE_SCRIPT } from "@/lib/fontScale";
import "./globals.css";

// 中文书法标题字：马善政毛笔楷书（Google Fonts，构建时自托管）
const brush = Ma_Shan_Zheng({
  weight: "400",
  variable: "--font-brush",
  display: "swap",
  // 该字体在 next/font 元数据中仅声明 latin，可用中文字符不能安全预加载
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      className={`no-js ${brush.variable} ${serif.variable} ${sans.variable} ${en.variable} h-full antialiased`}
    >
      <head>
        {/* 无 JS 降级标记：脚本一旦执行立即移除 no-js 类；
            若旧手机内核解析 JS 失败，no-js 会保留，CSS 据此让 Reveal 内容与加载页兜底直接可见。
            同时检测 IntersectionObserver：极老内核（iOS 12.0~12.1 Safari）没有该 API，
            加 no-io 类让 CSS 直接显示 Reveal 内容，避免 JS 抛错 */}
        <script
          id="no-js-remover"
          dangerouslySetInnerHTML={{ __html: `document.documentElement.classList.remove("no-js");if(!("IntersectionObserver"in window))document.documentElement.classList.add("no-io")` }}
        />
        <script
          id="font-scale-guard"
          dangerouslySetInnerHTML={{ __html: FONT_SCALE_SCRIPT }}
        />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
