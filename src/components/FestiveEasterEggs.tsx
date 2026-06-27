"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

// 喜庆互动彩蛋（藏起来的趣味，配极淡提示）：
//   · 长按囍字（带 data-happiness 标记的元素）→ 满屏金粉雨
//   · 双击页面任意处          → 一只红灯笼自下升空
//   · 摇一摇手机（devicemotion）→ 樱花/金箔飘落
// 全屏覆盖层、pointer-events-none，不挡任何交互。
// 尊重 prefers-reduced-motion：关闭动画时整体不渲染。

type Lantern = { id: number; x: number };
type Petal = { id: number; left: number; size: number; delay: number; sway: number; spin: number };

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

  // 三种彩蛋各自的触发状态
  const [raining, setRaining] = useState(false); // 金粉雨（整批，自动结束）
  const [lanterns, setLanterns] = useState<Lantern[]>([]); // 升空的灯笼
  const [petals, setPetals] = useState<Petal[]>([]); // 摇出的花瓣
  const seqRef = useRef(0); // 单调递增 id 源（避免 Math.random / Date.now）

  // —— 长按囍字 → 金粉雨 ——
  useEffect(() => {
    if (reduce) return;
    let timer: number | undefined;
    const isHappiness = (t: EventTarget | null) =>
      t instanceof Element && t.closest("[data-happiness]");

    const onDown = (e: Event) => {
      if (!isHappiness(e.target)) return;
      timer = window.setTimeout(() => setRaining(true), 450); // 长按 450ms 触发
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

  // 金粉雨：触发后约 3s 自动收场
  useEffect(() => {
    if (!raining) return;
    const t = window.setTimeout(() => setRaining(false), 3000);
    return () => window.clearTimeout(t);
  }, [raining]);

  // —— 双击页面 → 红灯笼升空 ——
  const spawnLantern = useCallback((clientX: number) => {
    const id = ++seqRef.current;
    // 用点击横向位置附近作为升空起点（百分比）
    const x = Math.max(8, Math.min(92, (clientX / window.innerWidth) * 100));
    setLanterns((l) => [...l, { id, x }]);
  }, []);

  useEffect(() => {
    if (reduce) return;
    const onDbl = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      // 落在按钮/链接上的双击不触发，避免干扰交互
      if (t?.closest("button, a")) return;
      spawnLantern(e.clientX);
    };
    document.addEventListener("dblclick", onDbl);
    return () => document.removeEventListener("dblclick", onDbl);
  }, [reduce, spawnLantern]);

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
    let last = 0; // 节流：避免持续摇动狂刷
    let lastTs = 0;
    const THRESHOLD = 22; // 加速度阈值
    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const mag = Math.abs(a.x ?? 0) + Math.abs(a.y ?? 0) + Math.abs(a.z ?? 0);
      // 用事件自带时间戳节流（不依赖 Date.now）
      const ts = e.timeStamp;
      if (mag > THRESHOLD && ts - lastTs > 1200) {
        lastTs = ts;
        last++;
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

      {/* —— 红灯笼升空 —— */}
      <AnimatePresence>
        {lanterns.map((l) => (
          <motion.div
            key={`lantern-${l.id}`}
            className="absolute"
            style={{ left: `${l.x}%`, bottom: -60 }}
            initial={{ y: 0, opacity: 0 }}
            animate={{
              y: "-118vh",
              x: [0, 14, -10, 8, 0], // 上升时左右微飘
              opacity: [0, 1, 1, 1, 0],
            }}
            transition={{ duration: 6, ease: "easeOut" }}
            onAnimationComplete={() =>
              setLanterns((arr) => arr.filter((x) => x.id !== l.id))
            }
          >
            <Lantern />
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

// 红灯笼造型：纯 CSS——红绸灯身 + 金顶金底 + 流苏，整体轻微摇曳。
function Lantern() {
  return (
    <motion.div
      className="relative flex flex-col items-center"
      animate={{ rotate: [-4, 4, -4] }}
      transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
    >
      {/* 顶盖 */}
      <span className="h-1.5 w-5 rounded-sm bg-china-gold-bright" />
      {/* 灯身 */}
      <span
        className="relative block h-10 w-9 rounded-[50%]"
        style={{
          background:
            "radial-gradient(circle at 35% 30%, var(--china-red-bright), var(--china-red) 70%, var(--china-red-deep))",
          boxShadow: "0 0 16px rgba(227,200,138,0.55), inset 0 0 8px rgba(0,0,0,0.3)",
        }}
      >
        {/* 灯身竖纹 */}
        <span className="absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-china-gold/50" />
        <span className="absolute inset-y-1 left-1/4 w-px bg-china-gold/30" />
        <span className="absolute inset-y-1 left-3/4 w-px bg-china-gold/30" />
      </span>
      {/* 底盖 */}
      <span className="h-1.5 w-5 rounded-sm bg-china-gold-bright" />
      {/* 流苏 */}
      <span className="h-3 w-px bg-china-gold-bright" />
      <span className="h-1 w-1 rounded-full bg-china-gold-bright" />
    </motion.div>
  );
}
