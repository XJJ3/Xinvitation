"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import confetti from "canvas-confetti";
import { siteConfig } from "@/config/site";
import { PHOTO_LAYOUT, WORLD_PHOTOS } from "@/config/worldPhotos";
import { openInWeChat, isWeChat, openWebMap, jumpToMap, MAP_PROVIDERS, type MapProvider, type MapPoint } from "@/lib/openMap";
import { track, fetchLove, sendLove, fetchBlessings, sendBlessing, type Blessing } from "@/lib/api";

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

type IconName = "heart" | "pin" | "send" | "copy"
const ICON_PATHS: Record<IconName, string> = {
  heart: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l8.9 8.8 8.8-8.8a5.5 5.5 0 0 0 0-7.8Z",
  pin: "M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0ZM12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  send: "m22 2-7 20-4-9-9-4 20-7ZM11 13l11-11",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
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

/* ── 信件：见字如面（参考第 6 版）── */
const LETTER_PHOTO_MAX = 250
const LETTER_PHOTO_MIN = 80

function LetterSection() {
  const l = wedding.letter
  const photo = WORLD_PHOTOS[PHOTO_LAYOUT[l.photoSlot] - 1].src
  const date = event.date.slice(0, 10).replace(/-/g, ".")
  const secRef = useRef<HTMLElement>(null)
  const photoRef = useRef<HTMLDivElement>(null)

  // 整个模块要放进一屏：先按最大照片高度量出内容总高，超出屏幕多少就把照片压矮多少，文字不缩
  useEffect(() => {
    const sec = secRef.current
    const ph = photoRef.current
    const box = sec?.firstElementChild as HTMLElement | null
    if (!sec || !ph || !box) return
    const fit = () => {
      ph.style.height = `${LETTER_PHOTO_MAX}px`
      const cs = getComputedStyle(sec)
      const need = box.offsetHeight + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
      const over = Math.max(0, need - window.innerHeight)
      ph.style.height = `${Math.max(LETTER_PHOTO_MIN, LETTER_PHOTO_MAX - over)}px`
    }
    fit()
    document.fonts?.ready.then(fit)
    window.addEventListener("resize", fit)
    return () => window.removeEventListener("resize", fit)
  }, [])

  return (
    <section ref={secRef} className="inv-section inv-screen inv-letter-sec">
      <Reveal className="inv-letter-box">
        <InvTitle en={l.en}>{l.title}</InvTitle>
        <div className="inv-letter">
          <div ref={photoRef} className="inv-letter-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt={`${couple.groom.name} & ${couple.bride.name}`} loading="lazy" />
            <span>{l.photoLabel}</span>
            <i>{date}</i>
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

/* ── 属于我们的画面：自动轮播 + 左右滑动 ── */
function MomentsSection() {
  const m = wedding.moments
  // 轮播框在手机上约占 1000×1200 物理像素，必须用原图（小图会被放大近 2 倍发虚）
  const photos = m.photos.map(p => ({ src: WORLD_PHOTOS[PHOTO_LAYOUT[p.slot] - 1].src, note: p.note }))
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const [onScreen, setOnScreen] = useState(false)
  // 只给看过的和下一张设置 src：12 张原图不会在进入本屏时一次性下载
  const [shown, setShown] = useState<Set<number>>(() => new Set([0, 1]))
  const secRef = useRef<HTMLElement>(null)
  const touchX = useRef<number | null>(null)
  const go = (n: number) => setIdx((n + photos.length) % photos.length)

  useEffect(() => {
    const el = secRef.current
    if (!el) return
    const io = new IntersectionObserver(es => setOnScreen(es[0].isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const next = (idx + 1) % photos.length
    setShown(s => (s.has(idx) && s.has(next) ? s : new Set([...s, idx, next])))
  }, [idx, photos.length])

  // 不在屏幕上时不自动翻页：否则打开页面后在别处停留，会在后台把原图一张张下载完
  useEffect(() => {
    if (paused || !onScreen) return
    const id = window.setInterval(() => setIdx(i => (i + 1) % photos.length), 5000)
    return () => window.clearInterval(id)
  }, [paused, onScreen, photos.length])

  const pad = (n: number) => String(n).padStart(2, "0")
  return (
    <section ref={secRef} className="inv-section inv-screen inv-fullh inv-moments-sec">
      <Reveal>
        <InvTitle en={m.en}>{m.title}</InvTitle>
      </Reveal>
      <Reveal className="inv-moments">
        <div
          className="inv-photo"
          onTouchStart={e => { touchX.current = e.touches[0].clientX; setPaused(true) }}
          onTouchEnd={e => {
            const start = touchX.current
            touchX.current = null
            setPaused(false)
            if (start === null) return
            const dx = e.changedTouches[0].clientX - start
            if (Math.abs(dx) > 40) go(idx + (dx < 0 ? 1 : -1))
          }}
        >
          {photos.map((p, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p.src} src={shown.has(i) ? p.src : undefined} alt={p.note} className={i === idx ? "on" : ""} loading="lazy" />
          ))}
          <span className="inv-count">{pad(idx + 1)} / {pad(photos.length)}</span>
          <span className="inv-note">{photos[idx].note}</span>
        </div>
        <div className="inv-ctrl">
          <button type="button" aria-label="上一张" onClick={() => go(idx - 1)}>←</button>
          <div className="inv-dots">
            {photos.map((p, i) => (
              <button type="button" key={p.src} aria-label={`第 ${i + 1} 张`} className={i === idx ? "on" : ""} onClick={() => go(i)}>
                <span />
              </button>
            ))}
          </div>
          <button type="button" aria-label="下一张" onClick={() => go(idx + 1)}>→</button>
        </div>
      </Reveal>
    </section>
  )
}

/* ── 地址：照片背景 + 毛玻璃卡片；导航沿用 openMap（微信内 wx.openLocation，外部 App/网页兜底）── */
function VenueSection({ toast }: { toast: (m: string) => void }) {
  const v = event.venue
  const [tip, setTip] = useState<string | null>(null)
  const point: MapPoint = { lat: v.lat, lng: v.lng, name: v.mapName, address: v.address }

  const navigate = () => {
    setTip(null)
    if (isWeChat()) {
      if (openInWeChat(point, () => setTip("微信地图打开失败，请稍后再试"))) return
      setTip("微信地图加载中，请稍候…")
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
      <img src={wedding.venue.bg} alt={v.name} loading="lazy" />
      <div className="inv-venue-shade" />
      <Reveal className="inv-venue-card">
        <span>{wedding.venue.en}</span>
        <h2>{v.name}</h2>
        <p>{v.address}</p>
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

  const [name, text, en] = f.signs[idx]
  const no = String(idx + 1).padStart(2, "0")
  const status = phase === "shaking" ? "正在为你摇出好运…" : phase === "dropped" ? `第 ${draws} 份好运已掉落` : "轻触竹筒开始求签"
  return (
    <section className="inv-section inv-screen inv-fullh inv-fortune-sec">
      <div className={`inv-fortune-arch ${phase === "dropped" ? `glow g${draws % 2}` : ""}`} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={f.bg} alt="" loading="lazy" />
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
                  <small>HAPPINESS</small>
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
              <div><small>{en}</small><span>第 {no} 签</span></div>
              <strong>{name}</strong>
              <p>{text}</p>
            </div>
          </div>
        </div>
        <div className="inv-collect">
          <div className="inv-collect-head">
            <span>MY LUCKY SIGNS</span>
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
  const [count, setCount] = useState<number | null>(null)
  const [mine, setMine] = useState<string[]>([])
  const [remote, setRemote] = useState<Blessing[]>([])
  const [myIds, setMyIds] = useState<number[]>([])
  const [hint, setHint] = useState("")
  const [wish, setWish] = useState<string>(presets[0])
  const [rolling, setRolling] = useState(false)

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
    setBump(b => b + 1)
    const id = Date.now() + Math.random()
    setPops(p => [...p, id])
    window.setTimeout(() => setPops(p => p.filter(x => x !== id)), 1100)
    // 每次轻触都上报（服务端按访客去重计点亮数，同时累计点击量）
    sendLove().then(s => { if (s) setCount(s.count) })
    if (lit) return
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
  return (
    <section className="inv-section inv-love-sec">
      <Reveal>
        <InvTitle en={l.en}>{l.title}</InvTitle>
        <div className={`inv-orbit ${lit ? "lit" : ""}`}>
          <div className="inv-orbit-photos" aria-hidden>
            {l.orbitPhotos.map((src, k) => (
              <span key={src} className={`p${k}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" loading="lazy" />
              </span>
            ))}
          </div>
          {pops.map(id => (
            <span key={id} className="inv-love-burst" aria-hidden>
              <span className="inv-love-ripple" />
              {[-46, -22, 0, 24, 48].map((dx, k) => (
                <b key={dx} className="inv-love-fly" style={{ "--dx": `${dx}px`, "--s": `${12 + (k % 3) * 4}px`, animationDelay: `${k * 60}ms` } as React.CSSProperties}>♥</b>
              ))}
            </span>
          ))}
          <button type="button" key={bump} className={`inv-love-btn ${bump ? "bump" : ""}`} onClick={light}>
            <Icon name="heart" filled />
            <span>{lit ? "已收到你的爱" : "轻触送出祝福"}</span>
          </button>
        </div>
        <p className="inv-love-count"><strong>{shownCount}</strong> 份爱意已抵达</p>

        <div className="inv-wall">
          <div className="inv-wall-head">
            <h3>{l.wallTitle}</h3>
            <small>{list.length} 条祝福</small>
          </div>
          <div className="inv-wall-list" ref={listRef}>
            {list.map((w, i) => (
              <p key={w.key} className={`${w.me ? "mine" : ""} ${fresh && i === 0 ? "fresh" : ""}`}><Icon name="heart" filled />{w.t}</p>
            ))}
          </div>
          <div className="inv-wall-send">
          {sent > 0 && <span key={`h-${sent}`} className="inv-send-hearts" aria-hidden><b>♥</b><b>♥</b><b>♥</b></span>}
          <div key={`in-${shake}`} className={`inv-wall-input ${shake ? "shake" : ""}`}>
            {/* 不支持自主输入：轻触祝福语随机换一句，满意后发送 */}
            <button type="button" className="wish" onClick={() => { shuffle(); if (hint) setHint("") }} aria-label={`当前祝福：${wish}，轻触换一句`}>
              <span key={wish}>{wish}</span>
            </button>
            <button type="button" className={`dice ${rolling ? "roll" : ""}`} onClick={() => { shuffle(); if (hint) setHint("") }} aria-label="换一句">🎲</button>
            <button type="button" key={`s-${sent}`} className={`send ${sent ? "go" : ""}`} onClick={send} aria-label="发送祝福">
              <Icon name="send" />
            </button>
          </div>
          </div>
          <p className="inv-wall-hint" role={hint ? "alert" : undefined}>{hint || "轻触祝福语随机换一句，选好后点发送"}</p>
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
    if (!name.trim()) return
    setStep("yes")
    fireworksConfetti()
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
              width: 36, height: 36, borderRadius: "50%",
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
        <button onClick={() => setStep("no")} style={{
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

/* ════════════════════════════════ MAIN ════════════════════════════════ */
export default function WeddingApp() {
  useViewportHeight()
  useEffect(() => { track("visit", document.referrer) }, [])
  const [toastMsg, toast] = useToast()
  const darkBg = `linear-gradient(160deg, ${C.wine} 0%, ${C.roseDark} 55%, ${C.wine} 100%)`

  return (
    <div className="inv" style={{ maxWidth: 480, margin: "0 auto", background: C.blushSoft, position: "relative", minHeight: "100svh" }}>
      <Petals />
      <div className={`inv-toast ${toastMsg ? "show" : ""}`}>{toastMsg}</div>

      {/* ══════════ COVER ══════════ */}
      <section style={{
        minHeight: "100svh",
        background: `linear-gradient(175deg, ${C.blushSoft} 0%, ${C.blush} 55%, #efc4ce 100%)`,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        position: "relative", overflow: "hidden", padding: "60px 24px 80px",
      }}>
        <div style={{ position: "absolute", inset: 14, border: `1px solid ${C.line}`, borderRadius: "170px 170px 12px 12px", pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 20, border: "1px dotted rgba(198,111,132,0.35)", borderRadius: "164px 164px 8px 8px", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: 90, left: -24, color: C.line, fontSize: 90, transform: "rotate(18deg)", pointerEvents: "none" }}>✦</div>
        <div style={{ position: "absolute", bottom: 120, right: -20, color: C.line, fontSize: 80, transform: "rotate(-22deg)", pointerEvents: "none" }}>❀</div>

        <div className="animate-fade-up" style={{ marginBottom: 22, position: "relative" }}>
          <div style={{
            width: 156, height: 156, borderRadius: "50%",
            border: `1px solid ${C.rose}`, padding: 6,
            background: "rgba(255,255,255,0.5)",
          }}>
            <div style={{ width: "100%", height: "100%", borderRadius: "50%", overflow: "hidden", background: C.blush, boxShadow: "0 12px 30px rgba(92,46,58,0.18)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={wedding.photos.coverAvatar} alt="新人合影" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </div>
          </div>
          <div style={{
            position: "absolute", bottom: 6, right: -2,
            width: 36, height: 36, borderRadius: "50%",
            background: C.roseDark, border: "2px solid #fff8f8",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "var(--font-serif)", fontSize: 15, color: "#fff8f8",
            boxShadow: "0 4px 12px rgba(113,53,69,0.27)",
          }}>囍</div>
        </div>

        <div className="animate-fade-up delay-200" style={{
          fontFamily: "var(--font-en)", fontSize: 13, letterSpacing: 5, color: C.rose, marginBottom: 14,
        }}>{wedding.cover.tagEn}</div>

        <div className="animate-fade-up delay-300" style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontFamily: "var(--font-en)", fontStyle: "italic", fontSize: 22, color: C.roseDark, marginBottom: 6 }}>Save our date</div>
          <span style={{ fontFamily: "var(--font-brush)", fontSize: 52, color: C.wine, textShadow: "0 2px 12px rgba(158,78,99,0.18)" }}>
            {couple.groom.name}
          </span>
          <span className="animate-heartbeat" style={{ display: "inline-block", fontSize: 28, margin: "0 12px", color: C.rose }}>{couple.separator}</span>
          <span style={{ fontFamily: "var(--font-brush)", fontSize: 52, color: C.wine, textShadow: "0 2px 12px rgba(158,78,99,0.18)" }}>
            {couple.bride.name}
          </span>
        </div>

        <div className="animate-fade-up delay-400" style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 12, letterSpacing: 4, color: C.muted, marginBottom: 6 }}>
            {wedding.cover.dateZhYear}
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 24, fontWeight: 500, color: C.wine, letterSpacing: 4 }}>
            {wedding.cover.dateZh}
          </div>
          <div style={{ fontFamily: "var(--font-en)", fontSize: 13, letterSpacing: 3, color: C.rose, marginTop: 6 }}>
            {wedding.cover.dateEn}
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 12, letterSpacing: 3, color: C.muted, marginTop: 4 }}>
            {event.lunar}
          </div>
        </div>

        <div className="animate-fade-up delay-600" style={{
          background: "rgba(255,253,251,0.8)", padding: "16px 20px",
          border: `1px solid ${C.line}`, boxShadow: `6px 6px 0 ${C.blush}`,
          marginBottom: 26, width: "100%", maxWidth: 340,
        }}>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 12, letterSpacing: 3, color: C.rose, textAlign: "center", marginBottom: 10 }}>
            距婚礼还有
          </div>
          <Countdown />
        </div>

        <div className="animate-fade-up delay-800" style={{
          fontFamily: "var(--font-serif)", fontSize: 14, letterSpacing: 2,
          color: C.roseDark, textAlign: "center",
        }}>
          {wedding.cover.venueLine}
        </div>

        <div className="animate-fade-in delay-1000" style={{
          position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
        }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: C.muted, fontFamily: "var(--font-serif)" }}>{wedding.cover.scrollHint}</div>
          <div style={{ animation: "float 1.5s ease-in-out infinite", color: C.rose, fontSize: 18 }}>↓</div>
        </div>
      </section>

      {/* ══════════ 见字如面 ══════════ */}
      <LetterSection />

      {/* ══════════ 属于我们的画面 ══════════ */}
      <MomentsSection />

      {/* ══════════ 3D GALLERY ══════════ */}
      <GalleryLazy />

      {/* ══════════ 地址 ══════════ */}
      <VenueSection toast={toast} />

      {/* ══════════ 今日幸福签 ══════════ */}
      <FortuneSection />

      {/* ══════════ 点亮一颗祝福 + 留言墙 ══════════ */}
      <LoveSection />

      {/* ══════════ QUOTE：满屏婚纱照 + 底部酒红渐变，引言压在照片下方 ══════════ */}
      <section className="inv-screen inv-fullh inv-quote-sec">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={wedding.quote.bg} alt={`${couple.groom.name} & ${couple.bride.name}`} loading="lazy" />
        <div className="inv-quote-shade" />
        <Reveal className="inv-quote-body">
          <div className="inv-quote-rule"><i /><span>◆</span><i /></div>
          <div className="inv-quote-text">{wedding.quote.text}</div>
          <div className="inv-quote-src">{wedding.quote.source}</div>
          <div className="inv-quote-en">{wedding.quote.en}</div>
        </Reveal>
      </section>

      {/* ══════════ RSVP ══════════ */}
      <section style={{ padding: "56px 28px", background: darkBg, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 24, left: "50%", transform: "translateX(-50%)", fontFamily: "var(--font-en)", fontSize: 95, color: "rgba(255,255,255,0.05)", pointerEvents: "none" }}>LOVE</div>
        <Reveal>
          <DarkHead script={wedding.rsvp.script} zh={wedding.rsvp.zh} />
          <p style={{ fontFamily: "var(--font-serif)", fontSize: 13, color: "rgba(255,248,248,0.85)", textAlign: "center", lineHeight: 2, marginBottom: 28 }}>
            {wedding.rsvp.introPre}<br />
            <strong style={{ color: C.roseLight }}>{wedding.rsvp.deadline}</strong> {wedding.rsvp.deadlineSuffix}
          </p>
          <RSVP />
        </Reveal>
        <Reveal delay={200}>
          <div style={{ marginTop: 40, textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 12, letterSpacing: 4, color: C.roseLight, marginBottom: 16 }}>
              {wedding.rsvp.contactsTitle}
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 40 }}>
              {wedding.rsvp.contacts.map(c => (
                <div key={c.name} style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--font-serif)", fontSize: 16, color: "#fff8f8", marginBottom: 4 }}>{c.name}</div>
                  <a href={`tel:${c.phone.replace(/-/g, "")}`} style={{
                    fontFamily: "var(--font-en)", fontSize: 16, color: C.roseLight, textDecoration: "none",
                  }}>{c.phone}</a>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

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
