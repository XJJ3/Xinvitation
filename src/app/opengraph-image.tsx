import { ImageResponse } from "next/og";
import { siteConfig } from "@/config/site";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = siteConfig.share.title;

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
          background: "linear-gradient(135deg, #fdf2f8 0%, #fce7f3 50%, #fbcfe8 100%)",
          fontFamily: "serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 36, color: "#9d4f6c", letterSpacing: 8 }}>
          SAVE THE DATE
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginTop: 20,
            fontSize: 110,
            color: "#831843",
            fontWeight: 600,
          }}
        >
          <span>{groom.name}</span>
          <span style={{ color: "#db2777", margin: "0 30px" }}>{separator}</span>
          <span>{bride.name}</span>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 30,
            fontSize: 40,
            color: "#db2777",
          }}
        >
          {siteConfig.share.description}
        </div>
      </div>
    ),
    { ...size }
  );
}
