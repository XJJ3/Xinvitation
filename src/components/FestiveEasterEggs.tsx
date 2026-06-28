"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

// 喜庆互动彩蛋（藏起来的趣味，配优雅提示）：
//   · 双击页面任意处 → 随机送出一件祝福礼物（红灯笼 / 囍气球 / 礼盒 / 爱心）自下升空，
//                     并随机飘起一句祝福语。每次双击都不重样，鼓励宾客多点送祝福。
//   · 长按囍字（带 data-happiness 标记）→ 满屏金粉雨
//   · 摇一摇手机（devicemotion）→ 樱花/金箔飘落
// 全屏覆盖层、pointer-events-none，不挡任何交互。
// 首次双击会派发全局事件 "guest-blessed"，供提示组件自动隐去。
// 尊重 prefers-reduced-motion：关闭动画时整体不渲染。

type GiftType = "lantern" | "balloon" | "gift" | "heart";
type Gift = {
  id: number;
  x: number; // 升空横向位置 %
  type: GiftType;
  blessing?: string; // 可选祝福语
  drift: number; // 上升时横向飘移基准
  duration: number;
};
type Petal = { id: number; left: number; size: number; delay: number; sway: number; spin: number };

// 升空礼物的类型池（轮换出现，保证多样）
const GIFT_TYPES: GiftType[] = ["lantern", "balloon", "gift", "heart"];
// 祝福语池（约一半礼物会带一句）
const BLESSINGS = [
  "百年好合",
  "白头偕老",
  "永结同心",
  "佳偶天成",
  "情比金坚",
  "甜甜蜜蜜",
  "喜结连理",
  "幸福美满",
];

// 金粉雨颗粒（确定性参数，避免 Math.random 带来的不稳定）
const RAIN = Array.from({ length: 60 }, (_, i) => {
  const rnd = (s: number) => {
    const x = Math.sin(s) * 10000;
    return x - Math.floor(x);
  };
  return {
    id: i,
    left: rnd(i + 1) * 100,
    size: 3 + rnd(i + 13) * 5,
    delay: rnd(i + 29) * 0.5,
    duration: 1.6 + rnd(i + 41) * 1.2,
    drift: (rnd(i + 53) - 0.5) * 80,
    gold: rnd(i + 67) > 0.35, // 多数金色，少量红色
  };
});

export function FestiveEasterEggs() {
  const reduce = useReducedMotion();

  const [raining, setRaining] = useState(false); // 金粉雨
  const [gifts, setGifts] = useState<Gift[]>([]); // 双击升空的祝福礼物
  const [petals, setPetals] = useState<Petal[]>([]); // 摇出的花瓣
  const seqRef = useRef(0); // 单调递增 id 源（避免 Math.random / Date.now）
  const blessedRef = useRef(false); // 是否已发出过首次双击事件

  // —— 长按囍字 → 金粉雨 ——
  useEffect(() => {
    if (reduce) return;
    let timer: number | undefined;
    const isHappiness = (t: EventTarget | null) =>
      t instanceof Element && t.closest("[data-happiness]");

    const onDown = (e: Event) => {
      if (!isHappiness(e.target)) return;
      timer = window.setTimeout(() => setRaining(true), 450);
    };
    const onUp = () => {
      if (timer) window.clearTimeout(timer);
      timer = undefined;
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    return () => {
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };
  }, [reduce]);

  useEffect(() => {
    if (!raining) return;
    const t = window.setTimeout(() => setRaining(false), 3000);
    return () => window.clearTimeout(t);
  }, [raining]);

  // —— 双击页面 → 随机祝福礼物升空 ——
  const spawnGift = useCallback((clientX: number) => {
    const seq = ++seqRef.current;
    // 用 seq 派生伪随机，确保多样且无需 Math.random
    const rnd = (s: number) => {
      const v = Math.sin(s * 12.9898) * 43758.5453;
      return v - Math.floor(v);
    };
    const type = GIFT_TYPES[seq % GIFT_TYPES.length];
    // 约一半礼物带祝福语
    const withBlessing = rnd(seq + 3) > 0.45;
    const blessing = withBlessing
      ? BLESSINGS[Math.floor(rnd(seq + 7) * BLESSINGS.length)]
      : undefined;
    const x = Math.max(8, Math.min(92, (clientX / window.innerWidth) * 100));
    const drift = (rnd(seq + 11) - 0.5) * 40;
    const duration = 5.2 + rnd(seq + 13) * 1.6;
    setGifts((g) => [...g, { id: seq, x, type, blessing, drift, duration }]);

    // 首次双击：通知提示组件「宾客已送出祝福」，让它优雅隐去
    if (!blessedRef.current) {
      blessedRef.current = true;
      window.dispatchEvent(new CustomEvent("guest-blessed"));
    }
  }, []);

  useEffect(() => {
    if (reduce) return;
    const onDbl = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("button, a")) return; // 按钮/链接上的双击不触发
      spawnGift(e.clientX);
    };
    document.addEventListener("dblclick", onDbl);
    return () => document.removeEventListener("dblclick", onDbl);
  }, [reduce, spawnGift]);

  // —— 摇一摇 → 花瓣飘落 ——
  const spawnPetals = useCallback(() => {
    const rnd = (s: number) => {
      const x = Math.sin(s) * 10000;
      return x - Math.floor(x);
    };
    const base = seqRef.current;
    const batch: Petal[] = Array.from({ length: 16 }, (_, i) => {
      const id = ++seqRef.current;
      return {
        id,
        left: rnd(base + i + 1) * 100,
        size: 8 + rnd(base + i + 17) * 8,
        delay: rnd(base + i + 31) * 0.6,
        sway: 30 + rnd(base + i + 47) * 50,
        spin: (rnd(base + i + 61) > 0.5 ? 1 : -1) * (180 + rnd(base + i + 71) * 240),
      };
    });
    setPetals((p) => [...p, ...batch]);
  }, []);

  useEffect(() => {
    if (reduce) return;
    let lastTs = 0;
    const THRESHOLD = 22;
    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const mag = Math.abs(a.x ?? 0) + Math.abs(a.y ?? 0) + Math.abs(a.z ?? 0);
      const ts = e.timeStamp;
      if (mag > THRESHOLD && ts - lastTs > 1200) {
        lastTs = ts;
        spawnPetals();
      }
    };
    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, [reduce, spawnPetals]);

  if (reduce) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[70] select-none overflow-hidden">
      {/* —— 金粉雨 —— */}
      <AnimatePresence>
        {raining &&
          RAIN.map((r) => (
            <motion.span
              key={`rain-${r.id}`}
              className="absolute rounded-full"
              style={{
                left: `${r.left}%`,
                top: -16,
                width: r.size,
                height: r.size,
                background: r.gold ? "var(--china-gold-bright)" : "var(--china-red-bright)",
                boxShadow: r.gold
                  ? "0 0 6px rgba(227,200,138,0.85)"
                  : "0 0 6px rgba(193,39,45,0.7)",
              }}
              initial={{ y: 0, x: 0, opacity: 0 }}
              animate={{ y: "108vh", x: r.drift, opacity: [0, 1, 1, 0.7, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: r.duration, delay: r.delay, ease: "easeIn" }}
            />
          ))}
      </AnimatePresence>

      {/* —— 双击升空的祝福礼物 —— */}
      <AnimatePresence>
        {gifts.map((g) => (
          <motion.div
            key={`gift-${g.id}`}
            className="absolute flex flex-col items-center"
            style={{ left: `${g.x}%`, bottom: -70 }}
            initial={{ y: 0, opacity: 0 }}
            animate={{
              y: "-122vh",
              x: [0, g.drift, -g.drift * 0.7, g.drift * 0.4, 0],
              opacity: [0, 1, 1, 1, 0],
            }}
            transition={{ duration: g.duration, ease: "easeOut" }}
            onAnimationComplete={() =>
              setGifts((arr) => arr.filter((x) => x.id !== g.id))
            }
          >
            {/* 祝福语：飘在礼物上方的金色小牌 */}
            {g.blessing && (
              <span
                className="font-kai mb-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold text-china-gold-bright"
                style={{
                  background: "rgba(122,15,19,0.78)",
                  border: "1px solid rgba(201,168,106,0.6)",
                  textShadow: "0 0 8px rgba(227,200,138,0.6)",
                }}
              >
                {g.blessing}
              </span>
            )}
            <GiftShape type={g.type} />
          </motion.div>
        ))}
      </AnimatePresence>

      {/* —— 摇出的花瓣 —— */}
      <AnimatePresence>
        {petals.map((p) => (
          <motion.span
            key={`petal-${p.id}`}
            className="absolute"
            style={{
              left: `${p.left}%`,
              top: -20,
              width: p.size,
              height: p.size * 0.7,
              borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%",
              background:
                "radial-gradient(circle at 35% 30%, #ffd9e0, #ff9bb3 60%, rgba(193,39,45,0.5))",
              boxShadow: "0 0 4px rgba(255,170,190,0.5)",
            }}
            initial={{ y: 0, x: 0, rotate: 0, opacity: 0 }}
            animate={{
              y: "112vh",
              x: [0, p.sway, -p.sway * 0.7, p.sway * 0.4, 0],
              rotate: [0, p.spin],
              opacity: [0, 1, 1, 0.7, 0],
            }}
            transition={{ duration: 5.5, delay: p.delay, ease: "linear" }}
            onAnimationComplete={() =>
              setPetals((arr) => arr.filter((x) => x.id !== p.id))
            }
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

// 单件祝福礼物造型（纯 CSS/SVG），随类型切换，整体带轻微摇曳。
function GiftShape({ type }: { type: GiftType }) {
  if (type === "lantern") return <Lantern />;
  if (type === "balloon") return <Balloon />;
  if (type === "gift") return <GiftBox />;
  return <Heart />;
}

// 红灯笼：红绸灯身 + 金顶金底 + 流苏，轻微摇曳。
function Lantern() {
  return (
    <motion.div
      className="relative flex flex-col items-center"
      animate={{ rotate: [-4, 4, -4] }}
      transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
    >
      <span className="h-1.5 w-5 rounded-sm bg-china-gold-bright" />
      <span
        className="relative block h-10 w-9 rounded-[50%]"
        style={{
          background:
            "radial-gradient(circle at 35% 30%, var(--china-red-bright), var(--china-red) 70%, var(--china-red-deep))",
          boxShadow: "0 0 16px rgba(227,200,138,0.55), inset 0 0 8px rgba(0,0,0,0.3)",
        }}
      >
        <span className="absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-china-gold/50" />
        <span className="absolute inset-y-1 left-1/4 w-px bg-china-gold/30" />
        <span className="absolute inset-y-1 left-3/4 w-px bg-china-gold/30" />
      </span>
      <span className="h-1.5 w-5 rounded-sm bg-china-gold-bright" />
      <span className="h-3 w-px bg-china-gold-bright" />
      <span className="h-1 w-1 rounded-full bg-china-gold-bright" />
    </motion.div>
  );
}

// 囍气球：红色气球身 + 金「囍」字 + 垂下的细线，轻微摇曳。
function Balloon() {
  return (
    <motion.div
      className="relative flex flex-col items-center"
      animate={{ rotate: [-3, 3, -3] }}
      transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
    >
      <span
        className="relative flex h-11 w-10 items-center justify-center rounded-[50%]"
        style={{
          background:
            "radial-gradient(circle at 32% 28%, #e85056, var(--china-red) 60%, var(--china-red-deep))",
          boxShadow: "0 0 14px rgba(227,200,138,0.4), inset 0 -3px 8px rgba(0,0,0,0.25)",
        }}
      >
        <span className="font-kai text-[13px] font-bold text-china-gold-bright">囍</span>
        {/* 气球高光 */}
        <span className="absolute left-2 top-1.5 h-2 w-1.5 rounded-full bg-white/40" />
      </span>
      {/* 气球结 */}
      <span
        className="h-0 w-0"
        style={{
          borderLeft: "3px solid transparent",
          borderRight: "3px solid transparent",
          borderTop: "4px solid var(--china-red-deep)",
        }}
      />
      {/* 垂线 */}
      <span className="h-5 w-px bg-china-gold/50" />
    </motion.div>
  );
}

// 金红礼盒：礼盒身 + 金丝带 + 蝴蝶结。
function GiftBox() {
  return (
    <motion.div
      className="relative"
      animate={{ rotate: [-3, 3, -3] }}
      transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
    >
      <svg viewBox="0 0 40 40" className="h-10 w-10" style={{ filter: "drop-shadow(0 0 8px rgba(227,200,138,0.45))" }}>
        {/* 盒身 */}
        <rect x="7" y="16" width="26" height="20" rx="2" fill="#c1272d" stroke="#e3c88a" strokeWidth="1.2" />
        {/* 盒盖 */}
        <rect x="5" y="11" width="30" height="7" rx="1.5" fill="#9e1318" stroke="#e3c88a" strokeWidth="1.2" />
        {/* 竖丝带 */}
        <rect x="18" y="11" width="4" height="25" fill="#e3c88a" />
        {/* 蝴蝶结 */}
        <path d="M20 11 C 14 4, 8 8, 20 12 C 32 8, 26 4, 20 11 Z" fill="#e3c88a" />
        <circle cx="20" cy="11" r="1.6" fill="#c1272d" />
      </svg>
    </motion.div>
  );
}

// 爱心：金描边红心，轻微脉动。
function Heart() {
  return (
    <motion.div
      animate={{ scale: [1, 1.12, 1] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
    >
      <svg viewBox="0 0 32 30" className="h-9 w-9" style={{ filter: "drop-shadow(0 0 8px rgba(227,200,138,0.5))" }}>
        <path
          d="M16 28 C 16 28, 2 19, 2 10 A 7 7 0 0 1 16 7 A 7 7 0 0 1 30 10 C 30 19, 16 28, 16 28 Z"
          fill="#c1272d"
          stroke="#e3c88a"
          strokeWidth="1.6"
        />
      </svg>
    </motion.div>
  );
}
