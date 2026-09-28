"use client";

import { useState } from "react";
import { siteConfig } from "@/config/site";

const PHOTOS = siteConfig.wedding.photos.gallery;

/**
 * 静态「卷轴画廊」——3D 画廊的兜底版本。
 *
 * 适用场景（canUse3D() 检测失败即回退到这里）：
 * 1. WebGL 不可用的设备
 * 2. prefers-reduced-motion: reduce 的用户（3D 漫游本质是持续动画，必须禁）
 *
 * 设计约束：零动画、零 WebGL、零滚动特效——象牙底纵向卷轴，
 * 金框卡片 + 毛笔题字，点击卡片打开大图（lightbox）。
 */
export default function GalleryFallback() {
  const [lightbox, setLightbox] = useState<number | null>(null);

  return (
    <div
      style={{
        background: "#fff8f8",
        color: "#4f3b40",
        padding: "40px 20px 56px",
        fontFamily: "var(--font-serif, serif)",
        position: "relative",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div
          style={{
            fontFamily: "var(--font-brush, serif)",
            fontSize: 30,
            color: "#542d38",
            letterSpacing: 6,
          }}
        >
          {siteConfig.wedding.gallery.script}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "#9e4e63",
            letterSpacing: 2,
            marginTop: 8,
            opacity: 0.8,
          }}
        >
          {siteConfig.wedding.gallery.zh}
        </div>
        <div
          style={{
            width: 48,
            height: 2,
            background: "#c66f84",
            margin: "16px auto 0",
          }}
        />
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 40,
          maxWidth: 420,
          margin: "0 auto",
        }}
      >
        {PHOTOS.map((photo, i) => (
          <button
            key={photo.src}
            type="button"
            onClick={() => setLightbox(i)}
            aria-label={`查看大图：${photo.label}`}
            style={{
              all: "unset",
              cursor: "pointer",
              display: "block",
              textAlign: "center",
            }}
          >
            <div
              style={{
                background: "#fffdf9",
                border: "3px solid #c66f84",
                borderRadius: 6,
                boxShadow: "0 4px 16px rgba(92, 46, 58, 0.14)",
                padding: "10px 10px 16px",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.src}
                alt={photo.label}
                loading="lazy"
                style={{
                  display: "block",
                  width: "100%",
                  aspectRatio: "1200 / 1680",
                  objectFit: "cover",
                  borderRadius: 2,
                }}
              />
              <div
                style={{
                  fontFamily: "var(--font-brush, serif)",
                  fontSize: 22,
                  color: "#542d38",
                  marginTop: 12,
                }}
              >
                {photo.label}
              </div>
              <div style={{ fontSize: 13, color: "#8b7379", marginTop: 4 }}>
                {photo.sub}
              </div>
            </div>
          </button>
        ))}
      </div>

      <div
        style={{
          textAlign: "center",
          marginTop: 40,
          fontFamily: "var(--font-brush, serif)",
          fontSize: 16,
          color: "#9e4e63",
          opacity: 0.85,
        }}
      >
        {siteConfig.wedding.footer.namesLine}
      </div>

      {lightbox !== null && (
        <div
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`大图：${PHOTOS[lightbox].label}`}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(62, 31, 40, 0.92)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            cursor: "pointer",
            padding: 24,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={PHOTOS[lightbox].src}
            alt={PHOTOS[lightbox].label}
            style={{
              maxWidth: "100%",
              maxHeight: "80vh",
              objectFit: "contain",
              border: "2px solid #c66f84",
              borderRadius: 4,
            }}
          />
          <div
            style={{
              fontFamily: "var(--font-brush, serif)",
              fontSize: 22,
              color: "#f2c3ce",
              marginTop: 16,
            }}
          >
            {PHOTOS[lightbox].label}
          </div>
          <div style={{ fontSize: 13, color: "#fff8f8", marginTop: 6 }}>
            {PHOTOS[lightbox].sub}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "rgba(255, 248, 248, 0.6)",
              marginTop: 14,
              letterSpacing: 1,
            }}
          >
            点击任意处关闭
          </div>
        </div>
      )}
    </div>
  );
}
