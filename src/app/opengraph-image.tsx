import { ImageResponse } from "next/og";
import { siteConfig } from "@/config/site";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = siteConfig.share.title;

// 微信分享卡片：中式红金风
export default function OpengraphImage() {
  const { groom, bride, separator } = siteConfig.couple;

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
          fontFamily: "serif",
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
          <span>{bride.name}</span>
          <span style={{ color: "#c9a86a", margin: "0 30px" }}>{separator}</span>
          <span>{groom.name}</span>
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
    { ...size }
  );
}
