"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import confetti from "canvas-confetti";
import { siteConfig } from "@/config/site";
import { openInWeChat, isWeChat, openWebMap, jumpToMap, MAP_PROVIDERS, type MapProvider, type MapPoint } from "@/lib/openMap";

/* 3D 画廊是纯客户端模块（three / WebGL），关闭 SSR 预渲染避免服务端执行 */
const Gallery3D = dynamic(() => import("./Gallery3D"), {
  ssr: false,
  loading: () => (
    <div style={{ height: "80svh", background: "#3a1428", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "#e8b84b", fontFamily: "var(--font-brush)", fontSize: 20 }}>{siteConfig.wedding.gallery.loading}</div>
    </div>
  ),
});

const { wedding, couple, event } = siteConfig;

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
  const colors = ["#7a2240", "#9b3358", "#c9922a", "#e8b84b", "#ffffff"]
  confetti({ particleCount: 120, spread: 100, origin: { y: 0.6 }, colors, scalar: 1.2 })
  setTimeout(() => confetti({ particleCount: 60, spread: 80, origin: { y: 0.5, x: 0.2 }, colors }), 300)
  setTimeout(() => confetti({ particleCount: 60, spread: 80, origin: { y: 0.5, x: 0.8 }, colors }), 500)
}

/* ── Falling red petals ── */
function Petals() {
  const petals = Array.from({ length: 16 }, (_, i) => ({
    id: i, left: `${(i * 6.25) % 98}%`,
    delay: `${i * 0.9}s`, dur: `${7 + (i % 5)}s`,
    size: 10 + (i % 4) * 3, char: ["🌸", "❀", "✿", "❃"][i % 4],
  }))
  return (
    <div className="petal-container">
      {petals.map(p => (
        <div key={p.id} className="petal" style={{
          left: p.left, animationDelay: p.delay,
          animationDuration: p.dur, fontSize: p.size,
        }}>{p.char}</div>
      ))}
    </div>
  )
}

/* ── SVG: Double happiness ── */
const DoubleHappiness = ({ size = 64, color = "#7a2240" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <text x="50" y="72" textAnchor="middle" fontSize="72" fill={color}
      fontFamily="var(--font-brush)" style={{ userSelect: "none" }}>囍</text>
  </svg>
)

/* ── Flip photo card ── */
function FlipCard({ front, back, frontLabel, backLabel }: {
  front: string; back: string; frontLabel: string; backLabel: string
}) {
  const [flipped, setFlipped] = useState(false)
  return (
    <div className="flip-card" style={{ height: 240 }} onClick={() => setFlipped(f => !f)}>
      <div className={`flip-inner ${flipped ? "flipped" : ""}`} style={{ height: "100%" }}>
        <div className="flip-front" style={{ height: "100%", overflow: "hidden" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={front} alt={frontLabel} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            background: "linear-gradient(transparent, rgba(26,5,5,0.7))",
            padding: "20px 12px 10px",
            color: "#e8b84b", fontFamily: "var(--font-brush)", fontSize: 18, textAlign: "center",
          }}>{frontLabel}</div>
          <div style={{
            position: "absolute", top: 8, right: 8, background: "rgba(26,5,5,0.6)",
            padding: "3px 8px", fontSize: 10, color: "rgba(255,255,255,0.6)",
            fontFamily: "var(--font-sans)", letterSpacing: 1,
          }}>TAP TO FLIP</div>
        </div>
        <div className="flip-back" style={{ height: "100%", overflow: "hidden" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={back} alt={backLabel} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{
            position: "absolute", inset: 0, background: "rgba(122,34,64,0.15)",
            display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 12,
          }}>
            <div style={{ color: "#fff", fontFamily: "var(--font-brush)", fontSize: 20, textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>
              {backLabel}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Red envelope interactive ── */
function RedEnvelope() {
  const [opened, setOpened] = useState(false)
  const handle = () => {
    if (opened) return
    setOpened(true)
    fireworksConfetti()
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 0" }}>
      {!opened ? (
        <div
          className="envelope-btn"
          onClick={handle}
          style={{
            width: 120, height: 150,
            background: "linear-gradient(160deg, #9b3358 0%, #3d1020 100%)",
            borderRadius: 8, cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            boxShadow: "0 8px 32px rgba(122,34,64,0.5)",
            position: "relative", overflow: "hidden",
          }}
        >
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 60,
            background: "linear-gradient(160deg, #7a2240 0%, #a0102a 100%)",
            clipPath: "polygon(0 0, 100% 0, 50% 70%)",
          }} />
          <DoubleHappiness size={52} color="#e8b84b" />
          <div style={{ fontFamily: "var(--font-brush)", fontSize: 14, color: "#f5d78e", marginTop: 8, zIndex: 1 }}>
            {wedding.redEnvelope.tapToOpen}
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center", animation: "fadeUp 0.6s ease both" }}>
          <div style={{
            background: "linear-gradient(160deg, #9b3358, #3d1020)",
            borderRadius: 8, padding: "28px 36px",
            boxShadow: "0 8px 32px rgba(122,34,64,0.4)",
          }}>
            <div style={{ fontFamily: "var(--font-brush)", fontSize: 32, color: "#f5d78e", marginBottom: 12 }}>
              {wedding.redEnvelope.blessingTitle}
            </div>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 13, color: "rgba(255,240,200,0.85)", lineHeight: 2 }}>
              {wedding.redEnvelope.blessingLines.map(line => <span key={line}>{line}<br /></span>)}
            </div>
          </div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--color-muted)", marginTop: 12, letterSpacing: 2 }}>
            {wedding.redEnvelope.received}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Lantern SVG ── */
const Lantern = ({ delay = "0s", size = 70 }: { delay?: string; size?: number }) => (
  <div className="animate-lantern" style={{ animationDelay: delay, display: "inline-block" }}>
    <svg width={size} height={size * 1.5} viewBox="0 0 70 105" fill="none">
      <line x1="35" y1="0" x2="35" y2="10" stroke="#c9922a" strokeWidth="1.5" />
      <rect x="22" y="10" width="26" height="8" rx="2" fill="#c9922a" />
      <ellipse cx="35" cy="55" rx="22" ry="32" fill="url(#lg)" opacity="0.95" />
      {[0.25, 0.5, 0.75].map((t, i) => (
        <ellipse key={i} cx="35" cy={55 - 32 + 32 * 2 * t} rx={Math.sqrt(1 - Math.pow(1 - 2 * t, 2)) * 22} ry="2"
          fill="none" stroke="rgba(200,100,50,0.4)" strokeWidth="1" />
      ))}
      <text x="35" y="60" textAnchor="middle" fontSize="20" fill="#ffd060" fontFamily="serif">囍</text>
      <rect x="22" y="85" width="26" height="6" rx="2" fill="#c9922a" />
      <line x1="35" y1="91" x2="35" y2="105" stroke="#c9922a" strokeWidth="2" />
      <defs>
        <linearGradient id="lg" x1="13" y1="0" x2="57" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3d1020" />
          <stop offset="40%" stopColor="#9b3358" />
          <stop offset="100%" stopColor="#3d1020" />
        </linearGradient>
      </defs>
    </svg>
  </div>
)

/* ── Section header ── */
const SectionHead = ({ script, zh }: { script: string; zh: string }) => (
  <div style={{ textAlign: "center", marginBottom: 32 }}>
    <div style={{ fontFamily: "var(--font-brush)", fontSize: 36, color: "#7a2240", marginBottom: 6 }}>
      {script}
    </div>
    <div className="gold-rule" style={{ justifyContent: "center", margin: "0 auto", maxWidth: 200 }}>
      <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, letterSpacing: 3, color: "#c9922a" }}>{zh}</span>
    </div>
  </div>
)

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
              background: active === i ? "rgba(232,184,75,0.3)" : "rgba(0,0,0,0.2)",
              border: `2px solid ${active === i ? "#e8b84b" : "rgba(232,184,75,0.35)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, transition: "all 0.3s",
            }}>{item.icon}</div>
            {i < items.length - 1 && (
              <div style={{ width: 2, flex: 1, minHeight: 20, background: "rgba(232,184,75,0.25)", margin: "4px 0" }} />
            )}
          </div>
          <div style={{ flex: 1, paddingBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "#e8b84b", letterSpacing: 2 }}>{item.time}</span>
              <span style={{ fontFamily: "var(--font-serif)", fontSize: 15, color: "#fff9f0", fontWeight: 600 }}>{item.title}</span>
            </div>
            <div style={{
              fontFamily: "var(--font-sans)", fontSize: 13, color: "rgba(255,249,240,0.65)", lineHeight: 1.8,
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
        fontFamily: "var(--font-serif)", fontSize: 36, fontWeight: 700,
        color: "#7a2240", lineHeight: 1,
        background: "rgba(122,34,64,0.06)", padding: "12px 4px",
        border: "1px solid rgba(122,34,64,0.2)",
      }}>{typeof v === "number" ? String(v).padStart(2, "0") : v}</div>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: 10, letterSpacing: 2, color: "#c9922a", marginTop: 6 }}>{label}</div>
    </div>
  )

  const t = time ?? { d: "--", h: "--", m: "--", s: "--" }
  return (
    <div style={{ display: "flex", gap: 8, maxWidth: 320, margin: "0 auto" }}>
      {unit(t.d as number | "--", "天")}
      <div style={{ display: "flex", alignItems: "center", paddingBottom: 22, color: "#7a2240", fontSize: 24, fontWeight: 700 }}>:</div>
      {unit(t.h as number | "--", "时")}
      <div style={{ display: "flex", alignItems: "center", paddingBottom: 22, color: "#7a2240", fontSize: 24, fontWeight: 700 }}>:</div>
      {unit(t.m as number | "--", "分")}
      <div style={{ display: "flex", alignItems: "center", paddingBottom: 22, color: "#7a2240", fontSize: 24, fontWeight: 700 }}>:</div>
      {unit(t.s as number | "--", "秒")}
    </div>
  )
}

/* ── Map navigation（接入 openMap.ts：微信内 wx.openLocation，外部 App/网页兜底）── */
function VenueNav({ banquet }: { banquet: (typeof event.banquets)[number] }) {
  const [tip, setTip] = useState<string | null>(null)
  const point: MapPoint = { lat: banquet.lat, lng: banquet.lng, name: banquet.mapName, address: banquet.venue }

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

  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 15, color: "#fff9f0", marginBottom: 4 }}>
        {banquet.label} · {banquet.mapName}
      </div>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "rgba(255,249,240,0.55)", lineHeight: 1.8, marginBottom: 12 }}>
        {banquet.venue}
      </div>
      <button
        type="button"
        onClick={navigate}
        style={{
          display: "inline-block", padding: "8px 24px",
          border: "1px solid rgba(232,184,75,0.6)",
          background: "transparent",
          fontFamily: "var(--font-sans)", fontSize: 12, letterSpacing: 2,
          color: "#f5d78e", cursor: "pointer",
        }}
      >导航前往 →</button>
      {tip && (
        <div style={{ marginTop: 8, fontFamily: "var(--font-sans)", fontSize: 11, color: "rgba(232,184,75,0.85)", lineHeight: 1.6 }}>
          {tip}
        </div>
      )}
    </div>
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
      <div style={{ fontFamily: "var(--font-brush)", fontSize: 28, color: "#f5d78e", marginBottom: 8 }}>太棒了！</div>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 14, color: "rgba(255,240,210,0.85)", lineHeight: 2 }}>
        亲爱的{name}，<br />我们无比期待与您共度这难忘时刻！<br />席位已为您保留 {guests} 位。
      </div>
    </div>
  )
  if (step === "no") return (
    <div style={{ textAlign: "center", padding: "40px 20px", animation: "fadeUp 0.6s ease both" }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>💌</div>
      <div style={{ fontFamily: "var(--font-brush)", fontSize: 24, color: "#f5d78e", marginBottom: 8 }}>感谢您的回复</div>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 14, color: "rgba(255,240,210,0.85)", lineHeight: 2 }}>
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
          border: "1px solid rgba(232,184,75,0.4)",
          background: "rgba(0,0,0,0.2)",
          fontFamily: "var(--font-serif)", fontSize: 15, color: "#fff9f0", outline: "none",
          borderRadius: 2,
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontFamily: "var(--font-serif)", fontSize: 14, color: "rgba(255,240,210,0.85)" }}>出席人数</span>
        <div style={{ display: "flex", gap: 8 }}>
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} onClick={() => setGuests(n)} style={{
              width: 36, height: 36, borderRadius: "50%",
              background: guests === n ? "#e8b84b" : "rgba(0,0,0,0.2)",
              border: `1px solid ${guests === n ? "#e8b84b" : "rgba(232,184,75,0.4)"}`,
              color: guests === n ? "#2e0c18" : "#f5d78e",
              fontFamily: "var(--font-serif)", fontSize: 14, cursor: "pointer",
              transition: "all 0.2s", fontWeight: guests === n ? 700 : 400,
            }}>{n}</button>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 4 }}>
        <button onClick={handleYes} style={{
          padding: "14px", background: "#e8b84b",
          color: "#2e0c18", border: "none", fontFamily: "var(--font-brush)", fontSize: 18,
          cursor: "pointer", letterSpacing: 2,
          transition: "transform 0.15s", borderRadius: 2, fontWeight: 700,
        }}
          onMouseDown={e => (e.currentTarget.style.transform = "scale(0.97)")}
          onMouseUp={e => (e.currentTarget.style.transform = "scale(1)")}
        >✓ 欣然赴约</button>
        <button onClick={() => setStep("no")} style={{
          padding: "14px", background: "rgba(0,0,0,0.2)",
          color: "rgba(255,240,210,0.7)", border: "1px solid rgba(232,184,75,0.3)",
          fontFamily: "var(--font-serif)", fontSize: 14, cursor: "pointer", borderRadius: 2,
        }}>✗ 遗憾缺席</button>
      </div>
    </div>
  )
}

/* ════════════════════════════════ MAIN ════════════════════════════════ */
export default function WeddingApp() {
  return (
    <div style={{ maxWidth: 480, margin: "0 auto", background: "var(--color-ivory)", position: "relative", minHeight: "100svh" }}>
      <Petals />

      {/* ══════════ COVER ══════════ */}
      <section style={{
        minHeight: "100svh",
        background: "linear-gradient(170deg, #2e0c18 0%, #3d1020 30%, #7a2240 65%, #3d1020 100%)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        position: "relative", overflow: "hidden", padding: "60px 24px 80px",
      }}>
        <div style={{ position: "absolute", inset: 0, opacity: 0.06, pointerEvents: "none" }}>
          {Array.from({ length: 30 }).map((_, i) => (
            <div key={i} style={{
              position: "absolute", left: `${(i * 37) % 100}%`, top: `${(i * 23) % 100}%`,
              fontFamily: "var(--font-brush)", fontSize: 40, color: "#e8b84b", userSelect: "none",
            }}>囍</div>
          ))}
        </div>

        <div style={{ position: "absolute", inset: 14, border: "1px solid rgba(232,184,75,0.4)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 20, border: "1px solid rgba(232,184,75,0.2)", pointerEvents: "none" }} />

        <div style={{ position: "absolute", top: -8, left: 0, right: 0, display: "flex", justifyContent: "space-between", padding: "0 24px" }}>
          <Lantern delay="0s" size={60} />
          <Lantern delay="0.5s" size={50} />
          <Lantern delay="1s" size={60} />
        </div>

        <div className="animate-fade-in" style={{ fontSize: 80, filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.4))", marginBottom: 20 }}
          onClick={fireworksConfetti} title="点我">
          <DoubleHappiness size={90} color="#f5d78e" />
        </div>

        <div className="animate-fade-up delay-100" style={{ marginBottom: 20, position: "relative" }}>
          <div style={{
            width: 148, height: 148, borderRadius: "50%",
            border: "2px solid rgba(232,184,75,0.5)",
            padding: 5,
            background: "linear-gradient(135deg, rgba(232,184,75,0.3), rgba(122,34,64,0.3))",
          }}>
            <div style={{
              width: "100%", height: "100%", borderRadius: "50%",
              border: "2px solid rgba(232,184,75,0.8)",
              overflow: "hidden",
              background: "#5a2035",
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={wedding.photos.coverAvatar}
                alt="新人合影"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            </div>
          </div>
          <div style={{
            position: "absolute", bottom: 4, right: -4,
            width: 32, height: 32, borderRadius: "50%",
            background: "#7a2240",
            border: "2px solid #f5d78e",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "var(--font-brush)", fontSize: 16, color: "#f5d78e",
          }}>囍</div>
        </div>

        <div className="animate-fade-up delay-200" style={{
          fontFamily: "var(--font-sans)", fontSize: 11, letterSpacing: 4,
          color: "rgba(245,215,142,0.7)", marginBottom: 16,
        }}>{wedding.cover.tagEn}</div>

        <div className="animate-fade-up delay-300" style={{ textAlign: "center", marginBottom: 16 }}>
          <span style={{ fontFamily: "var(--font-brush)", fontSize: 52, color: "#f5d78e", textShadow: "0 2px 12px rgba(0,0,0,0.4)" }}>
            {couple.groom.name}
          </span>
          <span className="animate-heartbeat" style={{
            display: "inline-block", fontSize: 28, margin: "0 12px", color: "#fff",
          }}>{couple.separator}</span>
          <span style={{ fontFamily: "var(--font-brush)", fontSize: 52, color: "#f5d78e", textShadow: "0 2px 12px rgba(0,0,0,0.4)" }}>
            {couple.bride.name}
          </span>
        </div>

        <div className="animate-fade-up delay-400" style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 11, letterSpacing: 4, color: "rgba(245,215,142,0.6)", marginBottom: 6 }}>
            {wedding.cover.dateZhYear}
          </div>
          <div style={{ fontFamily: "var(--font-brush)", fontSize: 32, color: "#f5d78e", letterSpacing: 4 }}>
            {wedding.cover.dateZh}
          </div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 11, letterSpacing: 3, color: "rgba(245,215,142,0.5)", marginTop: 4 }}>
            {wedding.cover.dateEn}
          </div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 11, letterSpacing: 3, color: "rgba(245,215,142,0.5)", marginTop: 4 }}>
            {event.lunar}
          </div>
        </div>

        <div className="animate-fade-up delay-600" style={{
          background: "rgba(0,0,0,0.25)", padding: "16px 20px",
          border: "1px solid rgba(232,184,75,0.25)", marginBottom: 28, width: "100%", maxWidth: 340,
        }}>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 10, letterSpacing: 3, color: "rgba(232,184,75,0.7)", textAlign: "center", marginBottom: 10 }}>
            距婚礼还有
          </div>
          <Countdown />
        </div>

        <div className="animate-fade-up delay-800" style={{
          fontFamily: "var(--font-serif)", fontSize: 13, letterSpacing: 2,
          color: "rgba(245,215,142,0.7)", textAlign: "center",
        }}>
          {wedding.cover.venueLine}
        </div>

        <div className="animate-fade-in delay-1000" style={{
          position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
        }}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: "rgba(245,215,142,0.5)", fontFamily: "var(--font-sans)" }}>{wedding.cover.scrollHint}</div>
          <div style={{ animation: "float 1.5s ease-in-out infinite", color: "rgba(232,184,75,0.6)", fontSize: 18 }}>↓</div>
        </div>
      </section>

      {/* ══════════ 3D GALLERY ══════════ */}
      <section style={{ position: "relative" }}>
        <div style={{
          padding: "48px 28px 24px",
          background: "linear-gradient(180deg, #fff5f5 0%, #2e0c18 100%)",
          textAlign: "center",
        }}>
          <Reveal>
            <SectionHead script={wedding.gallery.script} zh={wedding.gallery.zh} />
            <p style={{ fontFamily: "var(--font-serif)", fontSize: 13, color: "#7a3535", lineHeight: 2, marginBottom: 0 }}>
              {wedding.gallery.intro[0]}<br />{wedding.gallery.intro[1]}
            </p>
          </Reveal>
        </div>
        <Gallery3D />
      </section>

      {/* ══════════ FLIP PHOTO CARDS ══════════ */}
      <section style={{ padding: "56px 20px", background: "var(--color-ivory)" }}>
        <Reveal>
          <SectionHead script={wedding.flip.script} zh={wedding.flip.zh} />
          <p style={{ fontFamily: "var(--font-serif)", fontSize: 13, color: "#7a3535", textAlign: "center", marginBottom: 24, lineHeight: 2 }}>
            {wedding.flip.intro[0]}<br />{wedding.flip.intro[1]}
          </p>
        </Reveal>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {wedding.photos.flips.map((card, i) => (
            <Reveal key={i} delay={i * 100} fadeOnly>
              <FlipCard front={card.front} back={card.back} frontLabel={card.frontLabel} backLabel={card.backLabel} />
            </Reveal>
          ))}
        </div>
        <div style={{ textAlign: "center", marginTop: 16, fontFamily: "var(--font-sans)", fontSize: 11, color: "#c9922a", letterSpacing: 2 }}>
          {wedding.flip.hint}
        </div>
      </section>

      {/* ══════════ RED ENVELOPE ══════════ */}
      <section style={{
        padding: "56px 28px",
        background: "linear-gradient(160deg, #3d1020 0%, #7a2240 50%, #3d1020 100%)",
        textAlign: "center", position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", inset: 0, opacity: 0.07, overflow: "hidden", pointerEvents: "none" }}>
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} style={{
              position: "absolute", left: `${(i * 43) % 100}%`, top: `${(i * 29) % 100}%`,
              fontFamily: "var(--font-brush)", fontSize: 44, color: "#e8b84b",
            }}>囍</div>
          ))}
        </div>
        <div style={{ position: "absolute", inset: 14, border: "1px solid rgba(232,184,75,0.25)", pointerEvents: "none" }} />
        <Reveal>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ fontFamily: "var(--font-brush)", fontSize: 36, color: "#f5d78e", marginBottom: 6 }}>{wedding.redEnvelope.script}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
              <div style={{ flex: 1, height: 1, background: "linear-gradient(to right, transparent, rgba(232,184,75,0.6))", maxWidth: 80 }} />
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, letterSpacing: 3, color: "rgba(232,184,75,0.8)" }}>{wedding.redEnvelope.zh}</span>
              <div style={{ flex: 1, height: 1, background: "linear-gradient(to left, transparent, rgba(232,184,75,0.6))", maxWidth: 80 }} />
            </div>
          </div>
          <p style={{ fontFamily: "var(--font-serif)", fontSize: 13, color: "rgba(255,240,210,0.85)", marginBottom: 8, lineHeight: 2 }}>
            {wedding.redEnvelope.intro[0]}<br />{wedding.redEnvelope.intro[1]}
          </p>
          <RedEnvelope />
        </Reveal>
      </section>

      {/* ══════════ WEDDING DETAILS ══════════ */}
      <section style={{
        background: "linear-gradient(160deg, #3d1020 0%, #7a2240 50%, #3d1020 100%)",
        padding: "56px 28px", color: "#fff9f0", position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", inset: 0, opacity: 0.06, overflow: "hidden", pointerEvents: "none" }}>
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} style={{
              position: "absolute", left: `${(i * 43) % 100}%`, top: `${(i * 29) % 100}%`,
              fontFamily: "var(--font-brush)", fontSize: 48, color: "#e8b84b", userSelect: "none",
            }}>囍</div>
          ))}
        </div>
        <div style={{ position: "absolute", inset: 14, border: "1px solid rgba(232,184,75,0.2)", pointerEvents: "none" }} />

        <Reveal>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ fontFamily: "var(--font-brush)", fontSize: 36, color: "#f5d78e", marginBottom: 6 }}>{wedding.details.script}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
              <div style={{ flex: 1, height: 1, background: "linear-gradient(to right, transparent, rgba(232,184,75,0.6))", maxWidth: 80 }} />
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, letterSpacing: 3, color: "rgba(232,184,75,0.85)" }}>{wedding.details.zh}</span>
              <div style={{ flex: 1, height: 1, background: "linear-gradient(to left, transparent, rgba(232,184,75,0.6))", maxWidth: 80 }} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 40 }}>
            {[
              { e: "🗓️", l: "日期", v: "2026年11月10日", s: "黄道吉日 · 宜嫁娶" },
              { e: "⏰", l: "时间", v: "上午 11:30", s: "婚礼仪式开始" },
              { e: "📍", l: "午宴", v: "辰阳大酒店", s: "台州市黄岩区" },
              { e: "🥂", l: "晚宴", v: "下午 18:30", s: "裕锦大酒店 · 温州" },
            ].map(item => (
              <div key={item.l} style={{
                background: "rgba(0,0,0,0.2)",
                border: "1px solid rgba(232,184,75,0.25)",
                padding: "18px 14px", textAlign: "center",
              }}>
                <div style={{ fontSize: 26, marginBottom: 8 }}>{item.e}</div>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 10, letterSpacing: 3, color: "#e8b84b", marginBottom: 6 }}>{item.l}</div>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 13, color: "#fff9f0", marginBottom: 4 }}>{item.v}</div>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "rgba(255,249,240,0.5)" }}>{item.s}</div>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={200}>
          <div style={{ marginBottom: 8 }}>
            <div style={{
              fontFamily: "var(--font-sans)", fontSize: 10, letterSpacing: 4,
              color: "#e8b84b", textAlign: "center", marginBottom: 24,
            }}>{wedding.details.timelineTitle}</div>
            <Timeline />
          </div>
        </Reveal>

        <Reveal delay={300}>
          <div style={{
            background: "rgba(0,0,0,0.2)", border: "1px solid rgba(232,184,75,0.25)",
            padding: 20, marginTop: 8,
          }}>
            <div style={{ fontSize: 28, marginBottom: 8, textAlign: "center" }}>🗺️</div>
            <div style={{ display: "grid", gap: 20 }}>
              {event.banquets.map(b => <VenueNav key={b.label} banquet={b} />)}
            </div>
          </div>
        </Reveal>
      </section>

      {/* ══════════ QUOTE ══════════ */}
      <section style={{
        padding: "64px 36px", textAlign: "center",
        background: "linear-gradient(160deg, #2e0c18 0%, #3d1020 100%)",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", inset: 14, border: "1px solid rgba(232,184,75,0.2)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 20, border: "1px solid rgba(232,184,75,0.1)", pointerEvents: "none" }} />
        <Reveal>
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 8 }}>
              <div style={{ width: 40, height: 1, background: "rgba(232,184,75,0.5)" }} />
              <div style={{ fontFamily: "var(--font-brush)", fontSize: 24, color: "#e8b84b" }}>囍</div>
              <div style={{ width: 40, height: 1, background: "rgba(232,184,75,0.5)" }} />
            </div>
          </div>
          <div style={{ margin: "8px 0 28px" }}>
            <div style={{ fontFamily: "var(--font-brush)", fontSize: 32, color: "#f5d78e", lineHeight: 1.8, textShadow: "0 2px 16px rgba(0,0,0,0.3)" }}>
              {wedding.quote.text}
            </div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 11, letterSpacing: 3, color: "rgba(232,184,75,0.7)", marginTop: 12 }}>
              {wedding.quote.source}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
            <div style={{ width: 40, height: 1, background: "rgba(232,184,75,0.5)" }} />
            <div style={{ fontFamily: "var(--font-brush)", fontSize: 24, color: "#e8b84b" }}>囍</div>
            <div style={{ width: 40, height: 1, background: "rgba(232,184,75,0.5)" }} />
          </div>
        </Reveal>
      </section>

      {/* ══════════ RSVP ══════════ */}
      <section style={{
        padding: "56px 28px",
        background: "linear-gradient(160deg, #3d1020 0%, #7a2240 50%, #3d1020 100%)",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", inset: 0, opacity: 0.06, overflow: "hidden", pointerEvents: "none" }}>
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} style={{
              position: "absolute", left: `${(i * 53) % 100}%`, top: `${(i * 37) % 100}%`,
              fontFamily: "var(--font-brush)", fontSize: 44, color: "#e8b84b", userSelect: "none",
            }}>囍</div>
          ))}
        </div>
        <div style={{ position: "absolute", inset: 14, border: "1px solid rgba(232,184,75,0.2)", pointerEvents: "none" }} />

        <Reveal>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ fontFamily: "var(--font-brush)", fontSize: 36, color: "#f5d78e", marginBottom: 6 }}>{wedding.rsvp.script}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
              <div style={{ flex: 1, height: 1, background: "linear-gradient(to right, transparent, rgba(232,184,75,0.6))", maxWidth: 80 }} />
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, letterSpacing: 3, color: "rgba(232,184,75,0.85)" }}>{wedding.rsvp.zh}</span>
              <div style={{ flex: 1, height: 1, background: "linear-gradient(to left, transparent, rgba(232,184,75,0.6))", maxWidth: 80 }} />
            </div>
          </div>
          <p style={{ fontFamily: "var(--font-serif)", fontSize: 13, color: "rgba(255,240,210,0.85)", textAlign: "center", lineHeight: 2, marginBottom: 28 }}>
            {wedding.rsvp.introPre}<br />
            <strong style={{ color: "#f5d78e" }}>{wedding.rsvp.deadline}</strong> {wedding.rsvp.deadlineSuffix}
          </p>
          <RSVP />
        </Reveal>

        <Reveal delay={200}>
          <div style={{ marginTop: 40, textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 10, letterSpacing: 4, color: "rgba(232,184,75,0.8)", marginBottom: 16 }}>
              {wedding.rsvp.contactsTitle}
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 40 }}>
              {wedding.rsvp.contacts.map(c => (
                <div key={c.name} style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--font-brush)", fontSize: 18, color: "#f5d78e", marginBottom: 4 }}>{c.name}</div>
                  <a href={`tel:${c.phone.replace(/-/g, "")}`} style={{
                    fontFamily: "var(--font-sans)", fontSize: 13, color: "rgba(232,184,75,0.8)", textDecoration: "none",
                  }}>{c.phone}</a>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* ══════════ FOOTER ══════════ */}
      <footer style={{
        padding: "48px 28px", textAlign: "center",
        background: "linear-gradient(160deg, #2e0c18, #3d1020)",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", inset: 0, opacity: 0.06, pointerEvents: "none" }}>
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} style={{
              position: "absolute", left: `${(i * 43) % 100}%`, top: `${(i * 29) % 100}%`,
              fontFamily: "var(--font-brush)", fontSize: 40, color: "#e8b84b",
            }}>囍</div>
          ))}
        </div>
        <div className="animate-spin-slow" style={{
          width: 60, height: 60, margin: "0 auto 16px",
          border: "1px solid rgba(232,184,75,0.4)", borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <DoubleHappiness size={44} color="#e8b84b" />
        </div>
        <div style={{ fontFamily: "var(--font-brush)", fontSize: 36, color: "#f5d78e", marginBottom: 8 }}>
          {wedding.footer.namesLine}
        </div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 11, letterSpacing: 3, color: "rgba(245,215,142,0.5)" }}>
          {wedding.footer.dateLine}
        </div>
        <div style={{ width: 48, height: 1, background: "rgba(232,184,75,0.3)", margin: "20px auto" }} />
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 12, color: "rgba(245,215,142,0.45)" }}>
          {wedding.footer.blessing}
        </div>
      </footer>
    </div>
  )
}
