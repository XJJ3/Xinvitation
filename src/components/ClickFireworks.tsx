"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

// 点击绽放烟花：在用户点击位置爆开一朵金红烟花（一圈火星向外飞散 + 中心闪光）。
// 挂在第一屏上，点请柬任意处即触发。精致克制——单朵小巧、快速消失。
// 尊重 prefers-reduced-motion 由调用方决定是否挂载。

type Burst = { id: number; x: number; y: number };

// 单朵烟花的火星：确定性角度分布 + 交替金/红
const SPARKS = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2;
  const radius = 46 + ((i * 13) % 26); // 飞散半径 px
  return {
    i,
    dx: Math.cos(angle) * radius,
    dy: Math.sin(angle) * radius,
    gold: i % 2 === 0,
  };
});

export function ClickFireworks() {
  const [bursts, setBursts] = useState<Burst[]>([]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // 忽略落在按钮/链接上的点击，避免和其它交互冲突
    const target = e.target as HTMLElement;
    if (target.closest("button, a")) return;
    const id = (performance?.now?.() ?? bursts.length) + Math.floor(e.clientX);
    setBursts((b) => [...b, { id, x: e.clientX, y: e.clientY }]);
  }, [bursts.length]);

  return (
    <div
      className="absolute inset-0 z-20"
      onClick={handleClick}
      aria-hidden="true"
    >
      <AnimatePresence>
        {bursts.map((b) => (
          <div
            key={b.id}
            className="pointer-events-none fixed"
            style={{ left: b.x, top: b.y }}
          >
            {/* 中心闪光 */}
            <motion.span
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-china-gold-bright"
              style={{ width: 10, height: 10, boxShadow: "0 0 14px rgba(227,200,138,0.9)" }}
              initial={{ opacity: 1, scale: 0.4 }}
              animate={{ opacity: 0, scale: 2.4 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
            {/* 四散火星 */}
            {SPARKS.map((s) => (
              <motion.span
                key={s.i}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  width: 4,
                  height: 4,
                  background: s.gold ? "var(--china-gold-bright)" : "var(--china-red-bright)",
                  boxShadow: s.gold ? "0 0 6px rgba(227,200,138,0.9)" : "0 0 6px rgba(193,39,45,0.8)",
                }}
                initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                animate={{
                  opacity: [1, 1, 0],
                  x: [0, s.dx, s.dx * 1.15],
                  y: [0, s.dy, s.dy * 1.15 + 14], // 末段微微下坠（重力感）
                  scale: [1, 0.8, 0.2],
                }}
                transition={{ duration: 0.85, ease: "easeOut" }}
                onAnimationComplete={() => {
                  // 最后一颗火星动画结束时移除该 burst
                  if (s.i === SPARKS.length - 1) {
                    setBursts((arr) => arr.filter((x) => x.id !== b.id));
                  }
                }}
              />
            ))}
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
