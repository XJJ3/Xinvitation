"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { siteConfig } from "@/config/site";
import { PHOTO_LAYOUT, WORLD_PHOTOS } from "@/config/worldPhotos";
import GalleryFallback from "./GalleryFallback";
import { WeddingGallery } from "./weddingGallery";

const PHOTOS = siteConfig.wedding.photos.gallery;
const TITLE = "婚礼画廊";
const NAMES = siteConfig.wedding.footer.namesLine;
const DATE = "2026.11.10";
const WALL_PHOTOS = siteConfig.wedding.photos.wallPhotos;

type Mode = "pending" | "3d" | "css";
type Phase = "loading" | "ready" | "entered";

function canUse3D(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  const fine = window.matchMedia?.("(pointer: fine)")?.matches ?? false;
  if (fine) return false;
  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  if (coarse) return true;
  return "ontouchstart" in window && navigator.maxTouchPoints > 0;
}

const GLOBAL_CSS = `
@keyframes xinv-dot { 0%,100% { transform: translateY(0); opacity:.45 } 50% { transform: translateY(-6px); opacity:1 } }
@keyframes xinv-glow { 0%,100% { opacity:.75 } 50% { opacity:1 } }
`;

/** buildNow：首屏空闲后由外层置 true，不等滚到附近就提前在后台构建场景 */
export default function Gallery3D({ buildNow = false }: { buildNow?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const galleryRef = useRef<WeddingGallery | null>(null);
  const [mode, setMode] = useState<Mode>("pending");
  const [phase, setPhase] = useState<Phase>("loading");
  const [locked, setLocked] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [outdoor, setOutdoor] = useState<"lawn" | "beach">("lawn");
  // 画廊接近视口（约 1.5 屏内）才开始构建场景；离屏/后台则暂停渲染循环
  const [near, setNear] = useState(false);
  // 画廊当前是否在视口（含 20% 余量）内：IO 回调可能早于场景构建触发，必须记下来，构建完成与切回前台时按它决定是否暂停
  const onScreenRef = useRef(false);

  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (buildNow) setNear(true);
  }, [buildNow]);

  useEffect(() => {
    setIsTouch(isTouchDevice());
    setMode(canUse3D() ? "3d" : "css");
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    // 提前 1.5 屏开始构建，滚动到达时加载已完成；一旦开始就不再拆掉（重建代价高）
    const nearIO = new IntersectionObserver(
      (es) => {
        if (es[0].isIntersecting) {
          setNear(true);
          nearIO.disconnect();
        }
      },
      { rootMargin: "150% 0px" },
    );
    nearIO.observe(el);
    // 真正滚出视口才暂停渲染，避免上下滚动经过时的抖动
    const pauseIO = new IntersectionObserver(
      (es) => {
        onScreenRef.current = es[0].isIntersecting;
        galleryRef.current?.setRenderPaused(document.hidden || !onScreenRef.current);
      },
      { rootMargin: "20% 0px" },
    );
    pauseIO.observe(el);
    const onVis = () => galleryRef.current?.setRenderPaused(document.hidden || !onScreenRef.current);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      nearIO.disconnect();
      pauseIO.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  useEffect(() => {
    if (mode !== "3d" || !near) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let gallery: WeddingGallery | null = null;
    try {
      gallery = new WeddingGallery(canvas, {
        photos: PHOTOS,
        title: TITLE,
        namesLine: NAMES,
        dateLine: DATE,
        wallPhotos: WALL_PHOTOS,
        worldPhotos: WORLD_PHOTOS,
        photoLayout: PHOTO_LAYOUT,
        touch: isTouchDevice(),
        onReady: () => {
          if (!cancelled) setPhase((p) => (p === "loading" ? "ready" : p));
        },
        onActiveChange: (active) => {
          if (!cancelled) setLocked(active);
        },
        onOutdoorChange: (kind) => {
          if (!cancelled) setOutdoor(kind);
        },
        onError: () => {
          if (!cancelled) setMode("css");
        },
      });
      galleryRef.current = gallery;
      gallery.setRenderPaused(document.hidden || !onScreenRef.current);
    } catch {
      if (!cancelled) setMode("css");
      return;
    }

    return () => {
      cancelled = true;
      gallery?.dispose();
      galleryRef.current = null;
    };
  }, [mode, near]);

  const enter = useCallback(() => {
    setPhase("entered");
    galleryRef.current?.setIdleMode(false);
    galleryRef.current?.enter();
  }, []);

  const exit = useCallback(() => {
    galleryRef.current?.exit();
    galleryRef.current?.setIdleMode(true);
    setPhase("ready");
    setLocked(false);
  }, []);

  // 触屏滑动环视：记住当前负责环视的那根手指
  // 同一根手指：移动 < 8px 且 < 350ms 松开视为「点一下」→ 点哪走哪
  const lookPointer = useRef<{ id: number; x: number; y: number; x0: number; y0: number; t0: number } | null>(null);

  const onLookDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" || lookPointer.current) return;
    if ((e.target as HTMLElement).closest("button")) return;
    lookPointer.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      x0: e.clientX,
      y0: e.clientY,
      t0: performance.now(),
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onLookMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const p = lookPointer.current;
    if (!p || p.id !== e.pointerId) return;
    galleryRef.current?.addLookDelta(e.clientX - p.x, e.clientY - p.y);
    p.x = e.clientX;
    p.y = e.clientY;
  }, []);

  const onLookEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const p = lookPointer.current;
    if (!p || p.id !== e.pointerId) return;
    lookPointer.current = null;
    const still = Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 8;
    if (e.type === "pointerup" && still && performance.now() - p.t0 < 350) {
      galleryRef.current?.tapAt(e.clientX, e.clientY);
    }
  }, []);

  const toggleOutdoor = useCallback(() => {
    const next = outdoor === "beach" ? "lawn" : "beach";
    setOutdoor(next);
    galleryRef.current?.setOutdoor(next);
  }, [outdoor]);

  const lookActive = phase === "entered" && locked;

  const leave = useCallback(
    (dir: 1 | -1) => {
      const sec = rootRef.current?.closest("section");
      const target = dir > 0 ? sec?.nextElementSibling : sec?.previousElementSibling;
      exit();
      target?.scrollIntoView({ behavior: "smooth" });
    },
    [exit],
  );

  // 漫游中滚轮不参与 3D 操作，攒够一格就当翻页：退出画廊并滚到相邻模块。
  // 翻页后多拦 800ms，触控板的惯性滚动会打断平滑滚动、一次冲过好几个模块
  useEffect(() => {
    if (!lookActive) return;
    let acc = 0;
    let last = 0;
    let fired = false;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (fired) return;
      if (e.timeStamp - last > 300) acc = 0;
      last = e.timeStamp;
      acc += e.deltaY;
      if (Math.abs(acc) < 80) return;
      fired = true;
      leave(acc > 0 ? 1 : -1);
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      if (fired) window.setTimeout(() => window.removeEventListener("wheel", onWheel), 800);
      else window.removeEventListener("wheel", onWheel);
    };
  }, [lookActive, leave]);

  if (mode === "css") return <GalleryFallback />;

  const hints: [string, string][] = isTouch
    ? [
        ["滑动屏幕", "环视"],
        ["点地面", "走过去"],
        ["点照片", "走到照片前"],
      ]
    : [
        ["单击地面/照片", "走过去"],
        ["拖拽鼠标", "环视"],
        ["Esc", "暂停"],
      ];

  return (
    <div
      ref={rootRef}
      onPointerDown={lookActive ? onLookDown : undefined}
      onPointerMove={onLookMove}
      onPointerUp={onLookEnd}
      onPointerCancel={onLookEnd}
      className="inv-fullh"
      style={{
        position: "relative",
        width: "100%",
        overflow: "hidden",
        background: "#2a1520",
        // 进入漫游后才接管手势；未进入时放行竖向滑动，否则整屏画廊会把页面滚动卡死
        touchAction: lookActive ? "none" : "pan-y",
        userSelect: "none",
      }}
    >
      <style>{GLOBAL_CSS}</style>

      {mode === "3d" && (
        <canvas
          ref={canvasRef}
          style={{ display: "block", width: "100%", height: "100%", touchAction: lookActive ? "none" : "pan-y" }}
        />
      )}

      {phase !== "entered" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 40,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: "0 32px",
            background:
              "radial-gradient(ellipse at center, rgba(80,20,35,0.72) 0%, rgba(15,5,10,0.92) 100%)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <div style={{ width: 48, height: 1, background: "#c9849a" }} />
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#c9849a" aria-hidden>
              <path d="M12 2L14.5 9H22L16 13.5L18.5 21L12 16.5L5.5 21L8 13.5L2 9H9.5Z" />
            </svg>
            <div style={{ width: 48, height: 1, background: "#c9849a" }} />
          </div>

          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--font-serif, Georgia, "Songti SC", serif)',
              fontWeight: 300,
              fontSize: "clamp(40px, 12vw, 62px)",
              letterSpacing: 10,
              color: "#fce8ed",
              textIndent: 10,
            }}
          >
            {TITLE}
          </h1>

          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "22px 0 18px" }}>
            <div style={{ width: 64, height: 1, background: "rgba(201,132,154,0.5)" }} />
            <span
              style={{
                color: "#c9849a",
                fontSize: 11,
                letterSpacing: 6,
                fontFamily: 'var(--font-sans, sans-serif)',
              }}
            >
              婚礼影像展览
            </span>
            <div style={{ width: 64, height: 1, background: "rgba(201,132,154,0.5)" }} />
          </div>

          <p
            style={{
              margin: 0,
              maxWidth: 300,
              color: "#c4a0ae",
              fontSize: 14,
              lineHeight: 2,
              fontWeight: 300,
              fontFamily: 'var(--font-serif, Georgia, serif)',
            }}
          >
            步入爱意与光的世界
            <br />
            在光影长廊中，重温我们最美的时刻
          </p>

          {phase === "loading" ? (
            <div style={{ marginTop: 30, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <div style={{ display: "flex", gap: 8 }}>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: "#c9849a",
                      animation: `xinv-dot 1s ease-in-out ${i * 0.15}s infinite`,
                    }}
                  />
                ))}
              </div>
              <span style={{ color: "#8a6070", fontSize: 10, letterSpacing: 5, fontFamily: "var(--font-sans, sans-serif)" }}>
                {siteConfig.wedding.gallery.loading}
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={enter}
              style={{
                marginTop: 30,
                padding: "15px 46px",
                color: "#f5c0ce",
                fontSize: 12,
                letterSpacing: 6,
                textIndent: 6,
                fontFamily: "var(--font-sans, sans-serif)",
                background: "rgba(201,132,154,0.06)",
                border: "1px solid rgba(201,132,154,0.5)",
                borderRadius: 2,
                cursor: "pointer",
              }}
            >
              步入画廊
            </button>
          )}

          <div
            style={{
              marginTop: 34,
              display: "grid",
              gridTemplateColumns: "repeat(3, auto)",
              gap: 26,
              textAlign: "center",
            }}
          >
            {hints.map(([key, label]) => (
              <div key={key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ color: "#c9849a", fontSize: 10, letterSpacing: 2, fontFamily: "var(--font-sans, sans-serif)" }}>
                  {key}
                </span>
                <span style={{ color: "#6a4050", fontSize: 10, letterSpacing: 1, fontFamily: "var(--font-sans, sans-serif)" }}>
                  {label}
                </span>
              </div>
            ))}
          </div>

          <div
            style={{
              position: "absolute",
              bottom: 26,
              color: "rgba(242,195,206,0.6)",
              fontSize: 12,
              letterSpacing: 3,
              fontFamily: 'var(--font-serif, Georgia, "Songti SC", serif)',
            }}
          >
            {NAMES} · {DATE}
          </div>
        </div>
      )}

      {phase === "entered" && !locked && !isTouch && (
        <div
          onClick={enter}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 40,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            background: "rgba(20,8,12,0.55)",
            backdropFilter: "blur(2px)",
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-serif, Georgia, "Songti SC", serif)',
              fontStyle: "italic",
              fontSize: 26,
              color: "#fce8ed",
              marginBottom: 8,
            }}
          >
            已暂停
          </div>
          <div style={{ color: "#a08090", fontSize: 11, letterSpacing: 4, fontFamily: "var(--font-sans, sans-serif)" }}>
            点击任意处继续漫游
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              exit();
            }}
            style={{
              marginTop: 26,
              padding: "10px 28px",
              color: "#f2c3ce",
              fontSize: 12,
              letterSpacing: 2,
              background: "rgba(120,60,80,0.4)",
              border: "1px solid rgba(242,195,206,0.45)",
              borderRadius: 2,
              cursor: "pointer",
              fontFamily: "var(--font-sans, sans-serif)",
            }}
          >
            退出画廊
          </button>
        </div>
      )}

      {locked && (
        <>
          <div
            style={{
              position: "absolute",
              top: 22,
              left: 26,
              pointerEvents: "none",
              fontFamily: 'var(--font-serif, Georgia, "Songti SC", serif)',
              fontStyle: "italic",
              color: "rgba(242,195,206,0.75)",
              fontSize: 15,
              letterSpacing: 2,
            }}
          >
            {TITLE}
          </div>

          <div
            style={{
              position: "absolute",
              bottom: 74,
              left: 0,
              right: 0,
              textAlign: "center",
              pointerEvents: "none",
              color: "rgba(245,192,206,0.6)",
              fontSize: 10,
              letterSpacing: 4,
              fontFamily: "var(--font-sans, sans-serif)",
            }}
          >
            {isTouch
              ? "滑动环视 · 点地面或照片走过去"
              : "拖拽环视 · 单击地面或照片走过去 · W A S D 移动 · 滚轮翻页 · T 切换户外"}
          </div>
        </>
      )}

      {phase === "entered" && locked && (
        <>
          <button
            type="button"
            onClick={() => leave(1)}
            style={{
              position: "absolute",
              bottom: 22,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 45,
              padding: "9px 22px",
              color: "#f2c3ce",
              fontSize: 12,
              letterSpacing: 2,
              background: "rgba(120,60,80,0.4)",
              border: "1px solid rgba(242,195,206,0.45)",
              borderRadius: 999,
              cursor: "pointer",
              fontFamily: "var(--font-sans, sans-serif)",
              touchAction: "manipulation",
              whiteSpace: "nowrap",
            }}
          >
            继续浏览请帖 ↓
          </button>
          <button
            type="button"
            onClick={toggleOutdoor}
            style={{
              position: "absolute",
              top: 16,
              right: 100,
              zIndex: 45,
              padding: "8px 16px",
              color: "#f2c3ce",
              fontSize: 12,
              letterSpacing: 1,
              background: "rgba(120,60,80,0.4)",
              border: "1px solid rgba(242,195,206,0.45)",
              borderRadius: 2,
              cursor: "pointer",
              fontFamily: "var(--font-sans, sans-serif)",
              touchAction: "manipulation",
            }}
          >
            {outdoor === "beach" ? "🌿 草坪" : "🏖 海滩"}
          </button>
          <button
            type="button"
            onClick={exit}
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              zIndex: 45,
              padding: "8px 16px",
              color: "#f2c3ce",
              fontSize: 12,
              letterSpacing: 1,
              background: "rgba(120,60,80,0.4)",
              border: "1px solid rgba(242,195,206,0.45)",
              borderRadius: 2,
              cursor: "pointer",
              fontFamily: "var(--font-sans, sans-serif)",
              touchAction: "manipulation",
            }}
          >
            退出画廊
          </button>
        </>
      )}
    </div>
  );
}
