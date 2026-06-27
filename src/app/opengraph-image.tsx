import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { siteConfig } from "@/config/site";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = siteConfig.share.title;
// 静态导出（output: export）要求显式声明为静态：构建期生成一次 PNG。
export const dynamic = "force-static";

// 微信/社交分享卡片缩略图：中式红金风，构建时静态生成为 PNG。
// 字体用本地子集化的霞鹜文楷（含「囍」「徐俊杰」「鲍阳阳」等所有用到的字），
// 不依赖 Google Fonts / gstatic，国内构建环境也能正常渲染。
export default async function OpengraphImage() {
  const { groom, bride, separator } = siteConfig.couple;

  // process.cwd() 是项目根目录；OG 专用 woff 子集已提交进仓库
  const fontData = await readFile(
    join(process.cwd(), "public/fonts/og-lxgw-subset.woff")
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(160deg, #9e1318 0%, #7a0f13 100%)",
          fontFamily: "LXGW WenKai",
          position: "relative",
        }}
      >
        {/* 金色边框 */}
        <div
          style={{
            position: "absolute",
            inset: 28,
            border: "2px solid #c9a86a",
          }}
        />
        <div
          style={{
            display: "flex",
            fontSize: 160,
            color: "#c9a86a",
            fontWeight: 700,
          }}
        >
          囍
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 28,
            color: "#e8d9c4",
            letterSpacing: 8,
            marginTop: 10,
          }}
        >
          WELCOME TO OUR ENGAGEMENT PARTY
        </div>
        {/* 新人姓名：男方在前（与页面两屏一致） */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginTop: 30,
            fontSize: 88,
            color: "#f5ece0",
            fontWeight: 600,
          }}
        >
          <span>{groom.name}</span>
          <span style={{ color: "#c9a86a", margin: "0 30px" }}>{separator}</span>
          <span>{bride.name}</span>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 34,
            color: "#e3c88a",
          }}
        >
          {siteConfig.share.description}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "LXGW WenKai",
          data: fontData,
          style: "normal",
          weight: 400,
        },
      ],
    }
  );
}
