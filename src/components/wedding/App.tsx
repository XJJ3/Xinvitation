"use client";

import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import confetti from "canvas-confetti";
import { siteConfig } from "@/config/site";
import { PHOTO_LAYOUT, WORLD_PHOTOS } from "@/config/worldPhotos";
import { isWeChat, openWebMap, jumpToMap, MAP_PROVIDERS, type MapProvider, type MapPoint } from "@/lib/openMap";
import { track, fetchLove, sendLove, fetchBlessings, sendBlessing, sendRsvp, type Blessing } from "@/lib/api";

/* 3D 画廊是纯客户端模块（three / WebGL），关闭 SSR 预渲染避免服务端执行 */
const Gallery3D = dynamic(() => import("./Gallery3D"), {
  ssr: false,
  loading: () => (
    <div className="inv-fullh" style={{ background: "#542d38", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "#f2c3ce", fontFamily: "var(--font-serif)", fontSize: 16, letterSpacing: 4 }}>{siteConfig.wedding.gallery.loading}</div>
    </div>
  ),
});

/* three.js 代码块（约 450KB）+ 画廊全部模型贴图（约 8MB）不参与首屏：
 * 首屏加载完成 4s 后、浏览器空闲时才在后台挂载并构建画廊（宾客通常还在看封面/信件），
 * 滚到画廊时基本已就绪；若宾客滑得更快，接近视口前 2 屏也会立即开始。
 * 省流量模式 / 2G 网络下不提前构建，只按滚动位置加载。 */
function GalleryLazy() {
  const [near, setNear] = useState(false);
  const [warm, setWarm] = useState(false);
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => {
        if (es[0].isIntersecting) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "200% 0px" },
    );
    io.observe(el);

    const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    const lowData = !!conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? "");
    let timer = 0;
    let idleId = 0;
    // iOS Safari / 微信 iOS 没有 requestIdleCallback，退回 setTimeout
    const idleApi = window as Window & { requestIdleCallback?: Window["requestIdleCallback"] };
    const whenIdle = (cb: () => void) => {
      if (idleApi.requestIdleCallback) idleId = idleApi.requestIdleCallback(cb, { timeout: 3000 });
      else timer = window.setTimeout(cb, 300);
    };
    const start = () => {
      timer = window.setTimeout(() => whenIdle(() => (lowData ? void import("./Gallery3D") : setWarm(true))), 4000);
    };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => {
      io.disconnect();
      window.removeEventListener("load", start);
      window.clearTimeout(timer);
      if (idleId) window.cancelIdleCallback?.(idleId);
    };
  }, []);
  return (
    <section ref={ref} className="inv-gallery-sec">
      {near || warm ? <Gallery3D buildNow={warm} /> : <div className="inv-fullh" style={{ background: "#2a1520" }} />}
    </section>
  );
}

const { wedding, couple, event } = siteConfig;

function hideBrokenImage(event: SyntheticEvent<HTMLImageElement>) {
  const image = event.currentTarget;
  image.classList.add("image-failed");
  image.parentElement?.classList.add("image-error");
}

const C = {
  blush: "#f7e3e7",
  blushSoft: "#fff8f8",
  rose: "#c66f84",
  roseDark: "#9e4e63",
  roseLight: "#f2c3ce",
  wine: "#542d38",
  wineDeep: "#3e1f28",
  ink: "#4f3b40",
  muted: "#8b7379",
  line: "#ecd4d9",
  cream: "#f8f1eb",
}

/* ── 首屏新人姓名：字号自适应，保证「徐俊杰 ♡ 鲍阳阳」始终单行；窄屏按比例缩小，不低于 NAMES_MIN ──
   内层用 inline-block + nowrap，scrollWidth 恒等于单行自然宽度，据此与容器可用宽度求比例；
   只占容器 NAMES_FILL 的宽度，两侧给拱形边框留出呼吸空间 */
const NAMES_MAX = 40
const NAMES_MIN = 28
const NAMES_FILL = 0.8
function CoupleNames() {
  const boxRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLSpanElement>(null)
  const [fontSize, setFontSize] = useState(NAMES_MAX)

  useEffect(() => {
    const box = boxRef.current
    const row = rowRef.current
    if (!box || !row) return
    const fit = () => {
      const avail = box.clientWidth * NAMES_FILL
      const natural = row.scrollWidth
      if (!avail || !natural) return
      // 等比缩放并夹在 [NAMES_MIN, NAMES_MAX] 之间；收敛后 next === fontSize 不再触发更新
      const next = Math.min(NAMES_MAX, Math.max(NAMES_MIN, Math.floor((fontSize * avail) / natural)))
      if (next !== fontSize) setFontSize(next)
    }
    fit()
    document.fonts?.ready.then(fit).catch(() => {})
    window.addEventListener("resize", fit)
    return () => window.removeEventListener("resize", fit)
  }, [fontSize])

  const nameStyle: React.CSSProperties = {
    fontFamily: "var(--font-brush)", fontSize, color: C.wine, textShadow: "0 1px 3px rgba(255,255,255,.9), 0 2px 10px rgba(255,255,255,.7)",
  }
  return (
    <div ref={boxRef} style={{ width: "100%", textAlign: "center", overflow: "hidden" }}>
      <span ref={rowRef} style={{ display: "inline-block", whiteSpace: "nowrap" }}>
        <span style={nameStyle}>{couple.groom.name}</span>
        <span className="animate-heartbeat" style={{ display: "inline-block", fontSize: Math.round((fontSize * 28) / NAMES_MAX), margin: "0 12px", color: C.rose, textShadow: "0 1px 3px rgba(255,255,255,.9)" }}>{couple.separator}</span>
        <span style={nameStyle}>{couple.bride.name}</span>
      </span>
    </div>
  )
}

/* ── Scroll reveal ── */
function Reveal({ children, className = "", delay = 0, fadeOnly = false }: {
  children: React.ReactNode; className?: string; delay?: number; fadeOnly?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { el.classList.add("visible"); obs.disconnect() }
    }, { threshold: 0.1 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return (
    <div ref={ref} className={`${fadeOnly ? "reveal-fade" : "reveal"} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  )
}

/* ── Confetti bursts ── */
function fireworksConfetti() {
  const colors = [C.rose, C.roseDark, C.roseLight, "#e8b5c1", "#ffffff"]
  confetti({ particleCount: 120, spread: 100, origin: { y: 0.6 }, colors, scalar: 1.2 })
  setTimeout(() => confetti({ particleCount: 60, spread: 80, origin: { y: 0.5, x: 0.2 }, colors }), 300)
  setTimeout(() => confetti({ particleCount: 60, spread: 80, origin: { y: 0.5, x: 0.8 }, colors }), 500)
}

/* ── Falling petals ── */
function Petals() {
  const petals = Array.from({ length: 12 }, (_, i) => ({
    id: i, left: `${(i * 8.2) % 98}%`,
    delay: `${i * -0.8}s`, dur: `${8 + (i % 5) * 1.3}s`,
    size: 5 + (i % 4) * 2,
  }))
  return (
    <div className="petal-container">
      {petals.map(p => (
        <div key={p.id} className="petal" style={{
          left: p.left, animationDelay: p.delay, animationDuration: p.dur,
          width: p.size, height: p.size * 1.5,
          borderRadius: "70% 0 70% 0", background: "rgba(235,169,185,0.56)",
        }} />
      ))}
    </div>
  )
}

type IconName = "heart" | "pin" | "send" | "copy" | "shuffle"
const ICON_PATHS: Record<IconName, string> = {
  heart: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l8.9 8.8 8.8-8.8a5.5 5.5 0 0 0 0-7.8Z",
  pin: "M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0ZM12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  send: "m22 2-7 20-4-9-9-4 20-7ZM11 13l11-11",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  shuffle: "M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5",
}
const Icon = ({ name, filled = false }: { name: IconName; filled?: boolean }) => (
  <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
    <path d={ICON_PATHS[name]} fill={filled ? "currentColor" : "none"} stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/* ── Section header：英文小标 + 中文标题 + 菱形细线（第 5 版样式）── */
const InvTitle = ({ en, children }: { en: string; children: React.ReactNode }) => (
  <div className="inv-title">
    <span>{en}</span>
    <h2>{children}</h2>
    <i />
  </div>
)

/* ── 深色区块用的标题（玫瑰色） ── */
const DarkHead = ({ script, zh }: { script: string; zh: string }) => (
  <div style={{ textAlign: "center", marginBottom: 32 }}>
    <div style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 500, letterSpacing: 4, color: "#fff8f8", marginBottom: 8 }}>{script}</div>
    <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
      <div style={{ flex: 1, height: 1, background: "linear-gradient(to right, transparent, rgba(242,195,206,0.6))", maxWidth: 80 }} />
      <span style={{ fontFamily: "var(--font-en)", fontSize: 13, letterSpacing: 3, color: C.roseLight }}>{zh}</span>
      <div style={{ flex: 1, height: 1, background: "linear-gradient(to left, transparent, rgba(242,195,206,0.6))", maxWidth: 80 }} />
    </div>
  </div>
)

function useToast() {
  const [msg, setMsg] = useState("")
  const timer = useRef<number | undefined>(undefined)
  const show = (m: string) => {
    setMsg(m)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMsg(""), 2200)
  }
  return [msg, show] as const
}

/* ── Timeline ── */
function Timeline() {
  const [active, setActive] = useState<number | null>(null)
  const items = wedding.details.timeline
  return (
    <div>
      {items.map((item, i) => (
        <div
          key={i}
          onClick={() => setActive(active === i ? null : i)}
          style={{ display: "flex", gap: 16, marginBottom: 4, cursor: "pointer" }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{
              width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
              background: active === i ? "rgba(242,195,206,0.3)" : "rgba(0,0,0,0.15)",
              border: `2px solid ${active === i ? C.roseLight : "rgba(242,195,206,0.35)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, transition: "all 0.3s",
            }}>{item.icon}</div>
            {i < items.length - 1 && (
              <div style={{ width: 2, flex: 1, minHeight: 20, background: "rgba(242,195,206,0.25)", margin: "4px 0" }} />
            )}
          </div>
          <div style={{ flex: 1, paddingBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span style={{ fontFamily: "var(--font-en)", fontSize: 16, color: C.roseLight, letterSpacing: 1 }}>{item.time}</span>
              <span style={{ fontFamily: "var(--font-serif)", fontSize: 15, color: "#fff8f8", fontWeight: 600 }}>{item.title}</span>
            </div>
            <div style={{
              fontFamily: "var(--font-serif)", fontSize: 13, color: "rgba(255,248,248,0.7)", lineHeight: 1.8,
              maxHeight: active === i ? 200 : 0,
              overflow: "hidden", transition: "max-height 0.4s ease",
            }}>{item.desc}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Countdown（SSR 安全：先渲染占位 --，挂载后再启动计算，避免 hydration mismatch）── */
function Countdown() {
  const target = new Date(event.date).getTime()
  const calc = () => {
    const diff = target - Date.now()
    if (diff <= 0) return { d: 0, h: 0, m: 0, s: 0 }
    const d = Math.floor(diff / 86400000)
    const h = Math.floor((diff % 86400000) / 3600000)
    const m = Math.floor((diff % 3600000) / 60000)
    const s = Math.floor((diff % 60000) / 1000)
    return { d, h, m, s }
  }
  const [time, setTime] = useState<{ d: number; h: number; m: number; s: number } | null>(null)
  useEffect(() => {
    setTime(calc())
    const id = setInterval(() => setTime(calc()), 1000)
    return () => clearInterval(id)
  }, [target])

  const unit = (v: number | "--", label: string) => (
    <div style={{ textAlign: "center", flex: 1 }}>
      <div style={{
        fontFamily: "var(--font-serif)", fontSize: 32, fontWeight: 700,
        color: C.wine, lineHeight: 1,
        background: "rgba(255,255,255,0.55)", padding: "12px 4px",
        border: `1px solid ${C.line}`,
      }}>{typeof v === "number" ? String(v).padStart(2, "0") : v}</div>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 11, letterSpacing: 2, color: C.rose, marginTop: 6 }}>{label}</div>
    </div>
  )

  const t = time ?? { d: "--", h: "--", m: "--", s: "--" }
  const colon = <div style={{ display: "flex", alignItems: "center", paddingBottom: 22, color: C.rose, fontSize: 22 }}>:</div>
  return (
    <div style={{ display: "flex", gap: 8, maxWidth: 320, margin: "0 auto" }}>
      {unit(t.d as number | "--", "天")}{colon}
      {unit(t.h as number | "--", "时")}{colon}
      {unit(t.m as number | "--", "分")}{colon}
      {unit(t.s as number | "--", "秒")}
    </div>
  )
}

/* ── 信件：见字如面 ──
   上半部分为照片背景区（留白，纯照片），下半部分为信内容 */
function LetterSection() {
  const l = wedding.letter
  const photo = WORLD_PHOTOS[PHOTO_LAYOUT[l.photoSlot] - 1].src

  return (
    <section className="inv-section inv-screen inv-letter-sec">
      <Reveal className="inv-letter-box">
        <InvTitle en={l.en}>{l.title}</InvTitle>
        <div className="inv-letter">
          <div className="inv-letter-cover">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="inv-letter-bg" src={photo} alt="" loading="lazy" onError={hideBrokenImage} />
          </div>
          <div className="inv-letter-paper">
            <span className="inv-quote">“</span>
            <span className="inv-letter-to">{l.to}</span>
            {l.paragraphs.map(p => <p key={p}>{p}</p>)}
            <blockquote>“{l.quote[0]}<br />{l.quote[1]}”</blockquote>
          </div>
          <div className="inv-sign">
            <span>{l.signEn}</span>
            <strong>{couple.groom.name} <i>&</i> {couple.bride.name}</strong>
            <small>{l.signDate}</small>
          </div>
        </div>
      </Reveal>
    </section>
  )
}

/* ── 属于我们的画面：纵向铺展画册，照片直接展开给宾客浏览 ── */
function MomentsSection() {
  const m = wedding.moments
  const photos = m.photos.map(p => {
    const photo = WORLD_PHOTOS[PHOTO_LAYOUT[p.slot] - 1]
    return { src: photo.src, small: photo.small, note: p.note }
  })
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [dragX, setDragX] = useState(0)
  const closeRef = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<HTMLButtonElement>(null)
  const dragStartRef = useRef<number | null>(null)

  useEffect(() => {
    if (openIndex === null) return
    const html = document.documentElement
    const page = document.querySelector<HTMLElement>(".inv")
    const oldOverflow = html.style.overflow
    const oldSnap = html.style.scrollSnapType
    const wasInert = page?.inert ?? false
    html.style.overflow = "hidden"
    html.style.scrollSnapType = "none"
    if (page) page.inert = true
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenIndex(null)
      if (event.key === "ArrowRight") setOpenIndex(i => i === null ? null : (i + 1) % photos.length)
      if (event.key === "ArrowLeft") setOpenIndex(i => i === null ? null : (i - 1 + photos.length) % photos.length)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => {
      html.style.overflow = oldOverflow
      html.style.scrollSnapType = oldSnap
      if (page) page.inert = wasInert
      window.removeEventListener("keydown", onKeyDown)
      openerRef.current?.focus()
    }
  // 只在开关展览时运行，翻页不重置焦点或页面滚动状态。
  }, [openIndex === null, photos.length])

  const openPhoto = (index: number, trigger: HTMLButtonElement) => {
    openerRef.current = trigger
    setOpenIndex(index)
  }
  const shiftPhoto = (offset: number) => setOpenIndex(i => i === null ? null : (i + offset + photos.length) % photos.length)
  const onViewerPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return
    if ((event.target as HTMLElement).closest("button")) return
    dragStartRef.current = event.clientX
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onViewerPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (dragStartRef.current === null) return
    setDragX(Math.max(-120, Math.min(120, event.clientX - dragStartRef.current)))
  }
  const onViewerPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    if (dragStartRef.current === null) return
    const distance = event.clientX - dragStartRef.current
    dragStartRef.current = null
    setDragX(0)
    if (Math.abs(distance) > 54) shiftPhoto(distance < 0 ? 1 : -1)
  }
  const onViewerPointerCancel = () => { dragStartRef.current = null; setDragX(0) }
  return (
    <section className="inv-section inv-moments-sec">
      <Reveal>
        <InvTitle en={m.en}>{m.title}</InvTitle>
      </Reveal>
      <Reveal className="inv-moments-book">
        <div className="inv-moments-intro">
          <span className="inv-moments-rule" />
          <span>翻开我们的每一帧</span>
          <span className="inv-moments-rule" />
        </div>
        <div className="inv-moments-spread">
          {photos.map((p, i) => (
            <figure key={p.src} className={`inv-moment-card ${i === 0 ? "is-lead" : i % 3 === 0 ? "is-tall" : ""}`}>
              <button type="button" className="inv-moment-open" aria-label={`展开第 ${i + 1} 张照片`} onClick={e => openPhoto(i, e.currentTarget)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.src} alt={p.note || `婚礼照片 ${i + 1}`} loading="lazy" decoding="async" onError={hideBrokenImage} />
                <span className="inv-moment-zoom" aria-hidden="true"><i>✦</i></span>
                <span className="inv-moment-caption"><span>{String(i + 1).padStart(2, "0")}</span>{p.note}</span>
              </button>
            </figure>
          ))}
        </div>
        <div className="inv-moments-endmark" aria-hidden="true"><span>WITH ALL OUR LOVE</span><i>✦</i></div>
      </Reveal>
      {openIndex !== null && createPortal(
        <div className="inv-moment-viewer" role="dialog" aria-modal="true" aria-label="婚礼照片查看器" onClick={e => { if (e.target === e.currentTarget) setOpenIndex(null) }}>
          <div className="inv-moment-viewer-top">
            <span>OUR MOMENTS <span className="inv-moment-viewer-number" aria-live="polite">{String(openIndex + 1).padStart(2, "0")} / {String(photos.length).padStart(2, "0")}</span></span>
            <button ref={closeRef} type="button" className="inv-moment-close" aria-label="关闭照片" onClick={() => setOpenIndex(null)}>×</button>
          </div>
          <div className="inv-moment-viewer-stage" onPointerDown={onViewerPointerDown} onPointerMove={onViewerPointerMove} onPointerUp={onViewerPointerUp} onPointerCancel={onViewerPointerCancel}>
            <button type="button" className="inv-moment-viewer-arrow" aria-label="上一张照片" onClick={() => shiftPhoto(-1)}>‹</button>
            <figure className="inv-moment-viewer-photo" key={photos[openIndex].src} style={{ transform: `translateX(${dragX}px) rotate(${dragX / 28}deg)` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photos[openIndex].src} alt={photos[openIndex].note || `婚礼照片 ${openIndex + 1}`} onError={hideBrokenImage} />
              <figcaption>{photos[openIndex].note}</figcaption>
            </figure>
            <button type="button" className="inv-moment-viewer-arrow" aria-label="下一张照片" onClick={() => shiftPhoto(1)}>›</button>
          </div>
          <div className="inv-moment-thumb-rail" aria-label="照片缩略图导航">
            {photos.map((photo, index) => (
              <button key={photo.src} type="button" className={index === openIndex ? "is-active" : ""} aria-label={`打开第 ${index + 1} 张`} onClick={() => setOpenIndex(index)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.small} alt="" loading="lazy" />
              </button>
            ))}
          </div>
          <p className="inv-moment-viewer-foot">拖动照片翻页 · 缩略图可快速跳转</p>
        </div>, document.body,
      )}
    </section>
  )
}

/* ── 地址：照片背景 + 毛玻璃卡片；微信内直接打开腾讯地图网页版，外部按设备唤起地图 ── */
function VenueSection({ toast }: { toast: (m: string) => void }) {
  const v = event.venue
  const [tip, setTip] = useState<string | null>(null)
  const point: MapPoint = { lat: v.lat, lng: v.lng, name: v.mapName, address: v.address }

  const navigate = () => {
    setTip(null)
    if (isWeChat()) {
      openWebMap("tencent", point)
      return
    }
    const provider: MapProvider = "amap"
    const fallbackTip = () =>
      setTip(`未检测到地图 App，可用浏览器打开：${MAP_PROVIDERS.map(p => p.label).join(" / ")}（网页版）`)
    if (typeof window !== "undefined" && !("ontouchstart" in window)) {
      openWebMap(provider, point)
      return
    }
    jumpToMap(provider, point, fallbackTip)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(v.address)
      toast("地址已复制")
    } catch {
      toast(`请长按复制：${v.address}`)
    }
  }

  return (
    <section className="inv-venue inv-fullh">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={wedding.venue.bg} alt={v.name} loading="lazy" onError={hideBrokenImage} />
      <div className="inv-venue-shade" />
      <Reveal className="inv-venue-card">
        <div className="inv-venue-video-frame">
          <video className="inv-venue-video" autoPlay muted loop playsInline preload="metadata" poster={wedding.venue.bg} aria-label="酒店现场视频" onError={event => { event.currentTarget.hidden = true }}>
            <source src="/videos/venue-bg.m4v" type="video/mp4" />
          </video>
          <div className="inv-venue-video-caption">
            <span>{wedding.venue.en}</span>
            <h2>{v.name}</h2>
          </div>
        </div>
        <p className="inv-venue-address">{v.address}</p>
        <div className="inv-venue-info">
          <div><small>{wedding.venue.hallLabel}</small><strong>{v.hall}</strong></div>
          <div><small>{wedding.venue.timeLabel}</small><strong>{v.time}</strong></div>
        </div>
        <div className="inv-venue-btns">
          <button type="button" className="solid" onClick={navigate}><Icon name="pin" /> 打开地图导航</button>
          <button type="button" className="ghost" onClick={copy}>复制地址</button>
        </div>
        {tip && <div className="inv-venue-tip">{tip}</div>}
      </Reveal>
    </section>
  )
}

/* ── 今日幸福签：竹筒求签（参考第 7 版）。轻触竹筒 → 竹筒晃动 → 掉出一支签 → 签文展开 ── */
const FORTUNE_KEY = "inv-fortune-got"
const STICK_CHARS = ["囍", "福", "缘", "喜", "爱", "乐", "吉", "合"]
const SHAKE_MS = 1450

function FortuneSection() {
  const f = wedding.fortune
  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState<"idle" | "shaking" | "dropped">("idle")
  const [draws, setDraws] = useState(0)
  const [got, setGot] = useState<number[]>([])
  const busy = useRef(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(FORTUNE_KEY) ?? "[]")
      if (Array.isArray(saved)) setGot(saved.filter((x): x is number => Number.isInteger(x)))
    } catch {}
    return () => { if (timer.current) window.clearTimeout(timer.current) }
  }, [])

  const draw = () => {
    if (busy.current) return
    busy.current = true
    track("fortune")
    setPhase("shaking")
    timer.current = window.setTimeout(() => {
      let n = Math.floor(Math.random() * f.signs.length)
      if (n === idx) n = (n + 1) % f.signs.length
      setIdx(n)
      setDraws(d => d + 1)
      setPhase("dropped")
      window.setTimeout(fireworksConfetti, 700)
      setGot(g => {
        if (g.includes(n)) return g
        const next = [...g, n]
        try { localStorage.setItem(FORTUNE_KEY, JSON.stringify(next)) } catch {}
        return next
      })
      busy.current = false
    }, SHAKE_MS)
  }

  const [name, text] = f.signs[idx]
  const no = String(idx + 1).padStart(2, "0")
  const status = phase === "shaking" ? "正在为你摇出好运…" : phase === "dropped" ? `第 ${draws} 份好运已掉落` : "轻触竹筒开始求签"
  return (
    <section className="inv-section inv-screen inv-fullh inv-fortune-sec">
      <div className={`inv-fortune-arch ${phase === "dropped" ? `glow g${draws % 2}` : ""}`} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={f.bg} alt="" loading="lazy" onError={hideBrokenImage} />
      </div>
      {[0, 1, 2, 3, 4, 5].map(i => <span key={i} className={`inv-spark s${i}`} aria-hidden>✦</span>)}
      <Reveal>
        <InvTitle en={f.en}>{f.title}</InvTitle>
        <p className="inv-lead">{f.lead}</p>
        <div className="inv-stage-fit">
          <div className={`inv-stage ${phase}`}>
            <div className="inv-halo" aria-hidden><i /><i /><i /></div>
            <button type="button" className="inv-tube-btn" onClick={draw} aria-label="摇动竹筒抽取幸福签">
              <div className="inv-sticks" aria-hidden>
                {STICK_CHARS.map((c, i) => (
                  <i key={c} style={{ "--stick": i } as React.CSSProperties}><span>{c}</span></i>
                ))}
              </div>
              <div className="inv-tube" aria-hidden>
                <div className="inv-tube-rim" />
                <div className="inv-tube-body">
                  <i /><i /><i /><i />
                  <span>喜<br />签</span>
                </div>
                <div className="inv-tube-base" />
              </div>
            </button>
            <div className="inv-drop-stick" aria-hidden>
              <small>第 {no} 签</small>
              <strong>{name}</strong>
              <i>吉</i>
            </div>
            <div className="inv-shake-fx" aria-hidden><i>✦</i><i>♡</i><i>✧</i><i>✦</i></div>
            <p className="inv-tube-status">{status}</p>
            <div className="inv-slip" aria-live="polite">
              <div><span>第 {no} 签</span></div>
              <strong>{name}</strong>
              <p>{text}</p>
            </div>
          </div>
        </div>
        <div className="inv-collect">
          <div className="inv-collect-head">
            <span>我的幸运签</span>
            <em>已集 {got.length} / {f.signs.length}</em>
          </div>
          <div className="inv-collect-grid">
            {f.signs.map(([n], i) => (
              <span key={n} className={`${got.includes(i) ? "got" : ""} ${phase === "dropped" && i === idx ? "now" : ""}`}>
                {n.replace("签", "")}
              </span>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  )
}

/* ── 点亮一颗祝福 + 祝福留言墙（替换原红包）──
   有后端（server/）时：点亮计数与祝福墙走接口，所有宾客共享；
   后端不可用时退回本机 localStorage，页面交互不受影响 */
const LOVE_KEY = "inv-love-lit"
const WALL_KEY = "inv-wall-mine"
const MY_IDS_KEY = "inv-wall-mine-ids"

function readJson<T>(key: string, pick: (x: unknown) => x is T): T[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]")
    return Array.isArray(v) ? v.filter(pick) : []
  } catch { return [] }
}

function LoveSection() {
  const l = wedding.love
  const presets = l.presets
  const [lit, setLit] = useState(false)
  const [pressed, setPressed] = useState(false)
  const [count, setCount] = useState<number | null>(null)
  const [mine, setMine] = useState<string[]>([])
  const [remote, setRemote] = useState<Blessing[]>([])
  const [myIds, setMyIds] = useState<number[]>([])
  const [hint, setHint] = useState("")
  const [wish, setWish] = useState<string>(presets[0])
  const [rolling, setRolling] = useState(false)
  const [backgroundPhoto, setBackgroundPhoto] = useState(0)
  const backgroundPhotos = WORLD_PHOTOS.slice(0, 30).map(photo => photo.small)

  useEffect(() => {
    try { setLit(localStorage.getItem(LOVE_KEY) === "1") } catch {}
    setMine(readJson(WALL_KEY, (x): x is string => typeof x === "string"))
    setMyIds(readJson(MY_IDS_KEY, (x): x is number => Number.isInteger(x)))
    setWish(presets[Math.floor(Math.random() * presets.length)])
    let alive = true
    fetchLove().then(s => {
      if (!alive || !s) return
      setCount(s.count)
      if (s.lit) setLit(true)
    })
    fetchBlessings().then(items => { if (alive && items) setRemote(items) })
    return () => { alive = false }
  }, [presets])

  const [bump, setBump] = useState(0)
  const [pops, setPops] = useState<number[]>([])
  const light = () => {
    setPressed(true)
    setBackgroundPhoto(i => (i + 1) % backgroundPhotos.length)
    setBump(b => b + 1)
    const id = Date.now() + Math.random()
    setPops(p => [...p, id])
    window.setTimeout(() => setPops(p => p.filter(x => x !== id)), 1100)
    // 每次轻触都上报并刷新计数（count 为累计值，故每次点击都会 +1）；上报不依赖 lit，永远执行
    sendLove().then(s => { if (s) setCount(s.count) })
    if (lit) return // 已点亮过：只跳过首次的大彩带与本地标记，不影响上面的计数更新
    setLit(true)
    fireworksConfetti()
    try { localStorage.setItem(LOVE_KEY, "1") } catch {}
  }

  const shuffle = () => {
    let next = wish
    while (presets.length > 1 && next === wish) next = presets[Math.floor(Math.random() * presets.length)]
    setWish(next)
    setRolling(true)
    window.setTimeout(() => setRolling(false), 400)
  }

  const [sent, setSent] = useState(0)
  const [fresh, setFresh] = useState(false)
  const [shake, setShake] = useState(0)
  const [sending, setSending] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const nextPreset = (text: string) => {
    let next = presets[Math.floor(Math.random() * presets.length)]
    if (presets.length > 1 && next === text) next = presets[(presets.indexOf(next) + 1) % presets.length]
    return next
  }

  const send = async () => {
    const text = wish.trim()
    if (!text || sending) {
      if (!text) setShake(n => n + 1)
      return
    }
    setSending(true)
    const res = await sendBlessing(text)
    setSending(false)
    if (res && "error" in res) {
      setHint(res.error)
      setShake(n => n + 1)
      return
    }
    setHint("")
    setSent(n => n + 1)
    setFresh(true)
    listRef.current?.scrollTo({ top: 0, behavior: "smooth" })
    if (res) {
      setRemote(r => [res.item, ...r])
      const ids = [res.item.id, ...myIds].slice(0, 50)
      setMyIds(ids)
      try { localStorage.setItem(MY_IDS_KEY, JSON.stringify(ids)) } catch {}
    } else {
      // 后端不可用：只存本机，至少自己能看到
      const nextMine = [text, ...mine].slice(0, 20)
      setMine(nextMine)
      try { localStorage.setItem(WALL_KEY, JSON.stringify(nextMine)) } catch {}
    }
    setWish(nextPreset(text))
  }

  // key 用「来源 + 内容/ID + 第几次出现」，新留言插到最前面时旧条目 key 不变，只有新条目播放入场动画
  const seen = new Map<string, number>()
  const list = [
    ...mine.map(t => ({ t, me: true, base: `m-${t}` })),
    ...remote.map(b => ({ t: b.content, me: myIds.includes(b.id), base: `r-${b.id}` })),
    ...l.wall.map(t => ({ t, me: false, base: `w-${t}` })),
  ].map(w => {
    const n = (seen.get(w.base) ?? 0) + 1
    seen.set(w.base, n)
    return { ...w, key: `${w.base}-${n}` }
  })
  const shownCount = l.baseCount + (count ?? (lit ? 1 : 0))
  const backgroundImage = backgroundPhotos[backgroundPhoto]
  return (
    <section
      className="inv-section inv-love-sec"
      style={{ backgroundImage: `linear-gradient(180deg, rgba(84,45,56,.22), rgba(84,45,56,.74)), url("${backgroundImage}")` }}
    >
      <Reveal>
        <InvTitle en={l.en}>{l.title}</InvTitle>
        <div className={`inv-orbit ${lit ? "lit" : ""}`}>
          {pops.map(id => (
            <span key={id} className="inv-love-burst" aria-hidden>
              <span className="inv-love-ripple" />
              {[-46, -22, 0, 24, 48].map((dx, k) => (
                <b key={dx} className="inv-love-fly" style={{ "--dx": `${dx}px`, "--s": `${12 + (k % 3) * 4}px`, animationDelay: `${k * 60}ms` } as React.CSSProperties}>♥</b>
              ))}
            </span>
          ))}
          <button
            type="button"
            key={bump}
            className={`inv-love-btn ${bump ? "bump" : ""}`}
            onClick={light}
          >
            <Icon name="heart" filled />
            <span>{pressed ? "已收到你的爱" : "轻触送出祝福"}</span>
          </button>
        </div>
        <p className="inv-love-count"><strong>{shownCount}</strong> 份爱意已抵达</p>

        <div className="inv-wall">
          <div className="inv-wall-head">
            <h3>{l.wallTitle}</h3>
            <small>共 {shownCount} 条 · 最新 {Math.min(list.length, 10)} 条</small>
          </div>
          <div className="inv-wall-list" ref={listRef}>
            {list.slice(0, 10).map((w, i) => (
              <p key={w.key} className={`${w.me ? "mine" : ""} ${fresh && i === 0 ? "fresh" : ""}`}><Icon name="heart" filled />{w.t}</p>
            ))}
          </div>
          <div className="inv-wall-send">
            {sent > 0 && <span key={`h-${sent}`} className="inv-send-hearts" aria-hidden><b>♥</b><b>♥</b><b>♥</b></span>}
            <div key={`in-${shake}`} className={`inv-wish ${shake ? "shake" : ""}`}>
              {/* 不支持自主输入：轻触祝福语随机换一句，满意后发送 */}
              <button type="button" className="wish" onClick={() => { shuffle(); if (hint) setHint("") }} aria-label={`当前祝福：${wish}，轻触换一句`}>
                <span key={wish}>{wish}</span>
              </button>
              <div className="inv-wish-bar">
                {hint ? <span className="inv-wish-tag err" role="alert">{hint}</span> : null}
                <button type="button" className={`dice ${rolling ? "roll" : ""}`} onClick={() => { shuffle(); if (hint) setHint("") }} aria-label="换一句">
                  <Icon name="shuffle" />换一句
                </button>
                <button type="button" key={`s-${sent}`} className={`send ${sent ? "go" : ""}`} onClick={send} disabled={sending} aria-label="发送祝福">
                  送出<Icon name="send" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  )
}

/* ── RSVP ── */
function RSVP() {
  const [step, setStep] = useState<"form" | "yes" | "no">("form")
  const [name, setName] = useState("")
  const [guests, setGuests] = useState(1)

  const handleYes = () => {
    const n = name.trim()
    if (!n) return
    void sendRsvp(n, true, guests) // 后台落库（姓名绑定 vid），失败静默，不阻塞成功页与彩带
    setStep("yes")
    fireworksConfetti()
  }
  const handleNo = () => {
    const n = name.trim()
    if (n) void sendRsvp(n, false, 1) // 未填姓名时跳过上报，保留原可缺席流程
    setStep("no")
  }
  if (step === "yes") return (
    <div style={{ textAlign: "center", padding: "40px 20px", animation: "fadeUp 0.6s ease both" }}>
      <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 26, color: "#fff8f8", marginBottom: 8 }}>太棒了！</div>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 14, color: "rgba(255,248,248,0.85)", lineHeight: 2 }}>
        亲爱的{name}，<br />我们无比期待与您共度这难忘时刻！<br />席位已为您保留 {guests} 位。
      </div>
    </div>
  )
  if (step === "no") return (
    <div style={{ textAlign: "center", padding: "40px 20px", animation: "fadeUp 0.6s ease both" }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>💌</div>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 24, color: "#fff8f8", marginBottom: 8 }}>感谢您的回复</div>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 14, color: "rgba(255,248,248,0.85)", lineHeight: 2 }}>
        非常遗憾您无法出席，<br />我们的祝福永远与您同在。
      </div>
    </div>
  )
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <input
        type="text" placeholder="您的尊姓大名"
        value={name} onChange={e => setName(e.target.value)}
        style={{
          padding: "13px 16px",
          border: "1px solid rgba(242,195,206,0.45)",
          background: "rgba(255,255,255,0.08)",
          fontFamily: "var(--font-serif)", fontSize: 15, color: "#fff8f8", outline: "none",
          borderRadius: 999,
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontFamily: "var(--font-serif)", fontSize: 14, color: "rgba(255,248,248,0.85)" }}>出席人数</span>
        <div style={{ display: "flex", gap: 8 }}>
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} onClick={() => setGuests(n)} style={{
              width: 36, height: 36, minHeight: 0, borderRadius: "50%",
              background: guests === n ? "#fff8f8" : "rgba(255,255,255,0.08)",
              border: `1px solid ${guests === n ? "#fff8f8" : "rgba(242,195,206,0.45)"}`,
              color: guests === n ? C.wine : C.roseLight,
              fontFamily: "var(--font-en)", fontSize: 16, cursor: "pointer",
              transition: "all 0.2s", fontWeight: guests === n ? 600 : 400,
            }}>{n}</button>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 4 }}>
        <button onClick={handleYes} style={{
          padding: "14px", background: "#fff8f8",
          color: C.wine, border: "none", fontFamily: "var(--font-serif)", fontSize: 16,
          cursor: "pointer", letterSpacing: 2,
          transition: "transform 0.15s", borderRadius: 999, fontWeight: 600,
        }}
          onMouseDown={e => (e.currentTarget.style.transform = "scale(0.97)")}
          onMouseUp={e => (e.currentTarget.style.transform = "scale(1)")}
        >✓ 欣然赴约</button>
        <button onClick={handleNo} style={{
          padding: "14px", background: "transparent",
          color: "rgba(255,248,248,0.75)", border: "1px solid rgba(242,195,206,0.4)",
          fontFamily: "var(--font-serif)", fontSize: 14, cursor: "pointer", borderRadius: 999,
        }}>✗ 遗憾缺席</button>
      </div>
    </div>
  )
}

/* ── 把当前浏览器可视高度写进 --inv-vh，全屏模块（3D 画廊）据此铺满一屏 ──
   画廊引擎自己也监听 resize，但它比本 hook 先注册、会读到旧高度；
   所以高度变化后补发一次 resize 让画布按新尺寸重算（值不变时不再补发，不会循环） */
function useViewportHeight() {
  useEffect(() => {
    const root = document.documentElement
    let last = 0
    const update = () => {
      const h = window.innerHeight
      if (!h || h === last) return
      const first = last === 0
      last = h
      root.style.setProperty("--inv-vh", `${h}px`)
      if (!first) requestAnimationFrame(() => window.dispatchEvent(new Event("resize")))
    }
    update()
    window.addEventListener("resize", update)
    window.addEventListener("orientationchange", update)
    return () => {
      window.removeEventListener("resize", update)
      window.removeEventListener("orientationchange", update)
      root.style.removeProperty("--inv-vh")
    }
  }, [])
}

/* ── 自动持续下滑：requestAnimationFrame 每帧按时间差滚动（约每秒 60px）；
   每到一个模块顶部停留 5 秒后继续；触控按下时暂停，释放后继续 ── */
const AUTO_SCROLL_SPEED = 60
const AUTO_SCROLL_DWELL_MS = 5000

function useAutoScroll() {
  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual"
    window.scrollTo(0, 0)
    const sections = Array.from(document.querySelectorAll<HTMLElement>(".inv > section, .inv > footer"))
    if (sections.length < 2) return
    const tops = sections.map(s => s.offsetTop)

    let raf = 0
    let last = 0
    let paused = false
    let dwelling = false
    let lastIdx = -1
    let dwellTimer = 0
    let wheelTimer = 0

    const currentIndex = () => {
      const y = window.scrollY
      let idx = 0
      for (let i = 0; i < tops.length; i++) if (tops[i] <= y) idx = i
      return idx
    }

    const step = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0
      last = now
      if (paused || dwelling) {
        raf = requestAnimationFrame(step)
        return
      }
      const idx = currentIndex()
      if (idx !== lastIdx) {
        lastIdx = idx
        dwelling = true
        dwellTimer = window.setTimeout(() => { dwelling = false; last = 0 }, AUTO_SCROLL_DWELL_MS)
        raf = requestAnimationFrame(step)
        return
      }
      const max = document.documentElement.scrollHeight - window.innerHeight
      if (window.scrollY < max && dt > 0) window.scrollBy(0, AUTO_SCROLL_SPEED * dt)
      raf = requestAnimationFrame(step)
    }

    const pause = () => {
      paused = true
      dwelling = false
      last = 0
      window.clearTimeout(dwellTimer)
    }
    const resume = () => {
      paused = false
      last = 0
      lastIdx = currentIndex()
    }
    const onWheel = () => {
      pause()
      window.clearTimeout(wheelTimer)
      wheelTimer = window.setTimeout(resume, 300)
    }

    window.addEventListener("touchstart", pause, { passive: true })
    window.addEventListener("touchend", resume)
    window.addEventListener("wheel", onWheel, { passive: true })

    raf = requestAnimationFrame(step)

    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(dwellTimer)
      window.clearTimeout(wheelTimer)
      window.removeEventListener("touchstart", pause)
      window.removeEventListener("touchend", resume)
      window.removeEventListener("wheel", onWheel)
    }
  }, [])
}

/* ════════════════════════════════ MAIN ════════════════════════════════ */
export default function WeddingApp() {
  useViewportHeight()
  useAutoScroll()
  useEffect(() => { track("visit", document.referrer) }, [])
  const [toastMsg, toast] = useToast()
  const darkBg = `linear-gradient(160deg, ${C.wine} 0%, ${C.roseDark} 55%, ${C.wine} 100%)`

  return (
    <div className="inv" style={{ maxWidth: 480, margin: "0 auto", background: C.blushSoft, position: "relative", minHeight: "100svh" }}>
      <Petals />
      <div className={`inv-toast ${toastMsg ? "show" : ""}`}>{toastMsg}</div>

      {/* ══════════ COVER ══════════ */}
       <section className="inv-cover-sec" style={{
        height: "100svh",
        background: `linear-gradient(175deg, ${C.blushSoft} 0%, ${C.blush} 55%, #efc4ce 100%)`,
        display: "flex", flexDirection: "column",
        position: "relative", overflow: "hidden",
      }}>
        {/* 全屏照片背景 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="inv-cover-photo" src={wedding.photos.coverPhoto} alt="新人合影" onError={hideBrokenImage} />

        {/* 文字叠加：名字、日期居中，倒计时贴底部 */}
        <div className="inv-cover-body">
          <div className="inv-cover-body-main">
            <div className="animate-fade-up delay-200" style={{
              fontFamily: "var(--font-brush)", fontSize: 24, color: "#4d2f1f", lineHeight: 1, marginBottom: 2, letterSpacing: ".08em", textShadow: "0 1px 3px rgba(255,255,255,.9), 0 2px 8px rgba(255,255,255,.7)",
            }}>好久不见</div>

            <div className="animate-fade-up delay-300" style={{
              fontFamily: "var(--font-brush)", fontSize: 52, color: "#4d2f1f", lineHeight: 1.05, marginBottom: 16, letterSpacing: ".08em", textShadow: "0 2px 5px rgba(255,255,255,.9), 0 2px 14px rgba(255,255,255,.7)",
            }}>婚礼见</div>

            <div className="animate-fade-up delay-400" style={{ alignSelf: "stretch", textAlign: "center", marginBottom: 12, marginTop: "auto" }}>
              <CoupleNames />
            </div>

          <div className="animate-fade-up delay-400 inv-cover-date">
            <div className="inv-cover-day">{wedding.cover.dateEn} · {wedding.cover.dateWeekday}</div>
            <div className="inv-cover-lunar">{event.lunar}</div>
          </div>
          </div>

          <div className="animate-fade-up delay-600 inv-cover-countdown">
            <div className="inv-cover-countdown-label">距婚礼还有</div>
            <Countdown />
          </div>
        </div>

      </section>

      {/* ══════════ 见字如面 ══════════ */}
      <LetterSection />

      {/* ══════════ 属于我们的画面 ══════════ */}
      <MomentsSection />

      {/* ══════════ 地址 ══════════ */}
      <VenueSection toast={toast} />

      {/* ══════════ 今日幸福签 ══════════ */}
      <FortuneSection />

      {/* ══════════ 点亮一颗祝福 + 留言墙 ══════════ */}
      <LoveSection />

      {/* ══════════ QUOTE：满屏婚纱照 + 底部酒红渐变，引言压在照片下方 ══════════ */}
      <section className="inv-screen inv-fullh inv-quote-sec">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={wedding.quote.bg} alt={`${couple.groom.name} & ${couple.bride.name}`} loading="lazy" onError={hideBrokenImage} />
        <div className="inv-quote-shade" />
        <Reveal className="inv-quote-body">
          <div className="inv-quote-rule"><i /><span>◆</span><i /></div>
          <div className="inv-quote-text">{wedding.quote.text}</div>
          <div className="inv-quote-src">{wedding.quote.source}</div>
          <div className="inv-quote-en">{wedding.quote.en}</div>
        </Reveal>
      </section>

      {/* ══════════ RSVP ══════════ */}
      <section className="inv-rsvp-sec" style={{ background: darkBg, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 24, left: "50%", transform: "translateX(-50%)", fontFamily: "var(--font-en)", fontSize: 95, color: "rgba(255,255,255,0.05)", pointerEvents: "none" }}>LOVE</div>
        <Reveal>
          <DarkHead script={wedding.rsvp.script} zh={wedding.rsvp.zh} />
          <p style={{ fontFamily: "var(--font-serif)", fontSize: 13, color: "rgba(255,248,248,0.85)", textAlign: "center", lineHeight: 2, marginBottom: 28 }}>
            {wedding.rsvp.introPre}
          </p>
          <RSVP />
        </Reveal>
      </section>

      {/* ══════════ 3D GALLERY：所有婚礼正事完成后再进入沉浸体验 ══════════ */}
      <GalleryLazy />

      {/* ══════════ FOOTER ══════════ */}
      <footer style={{ padding: "56px 28px 40px", textAlign: "center", background: C.wine, position: "relative", overflow: "hidden" }}>
        <div style={{
          width: 60, height: 60, margin: "0 auto 16px",
          border: "1px solid rgba(242,195,206,0.5)", borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "var(--font-serif)", fontSize: 24, color: C.roseLight,
        }}>囍</div>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 26, letterSpacing: 4, color: "#fff8f8", marginBottom: 8 }}>
          {wedding.footer.namesLine}
        </div>
        <div style={{ fontFamily: "var(--font-en)", fontSize: 13, letterSpacing: 3, color: "#bd9da5" }}>
          {wedding.footer.dateLine}
        </div>
        <div style={{ width: 48, height: 1, background: "rgba(242,195,206,0.35)", margin: "20px auto" }} />
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 13, color: "#efdde1" }}>
          {wedding.footer.blessing}
        </div>
      </footer>
    </div>
  )
}
