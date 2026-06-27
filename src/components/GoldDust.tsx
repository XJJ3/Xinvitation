"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";

// 持续氛围：极淡的金色粉尘/光斑缓缓上浮飘动，增加高级质感与空间层次。
// 全程低透明度、慢速循环，不抢戏。固定满屏、不挡交互。
// 尊重 prefers-reduced-motion：关闭动画时不渲染任何颗粒。
export function GoldDust({ count = 22 }: { count?: number }) {
  const reduce = useReducedMotion();

  // 用确定性伪随机生成颗粒参数（避免 Math.random，保证 SSR/CSR 一致）
  const dust = useMemo(() => {
    const rnd = (seed: number) => {
      const x = Math.sin(seed) * 10000;
      return x - Math.floor(x); // 0~1
    };
    return Array.from({ length: count }, (_, i) => {
      const left = rnd(i + 1) * 100; // 横向起点 %
      const size = 1.5 + rnd(i + 17) * 3; // 颗粒尺寸 px
      const duration = 14 + rnd(i + 31) * 16; // 单次上浮时长 s
      const delay = -rnd(i + 53) * duration; // 负延迟：进场即铺满
      const drift = (rnd(i + 71) - 0.5) * 60; // 横向漂移幅度 px
      const opacity = 0.15 + rnd(i + 97) * 0.35; // 峰值透明度
      return { id: i, left, size, duration, delay, drift, opacity };
    });
  }, [count]);

  if (reduce) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[5] overflow-hidden select-none"
    >
      {dust.map((d) => (
        <motion.span
          key={d.id}
          className="absolute rounded-full bg-china-gold-bright"
          style={{
            left: `${d.left}%`,
            bottom: -10,
            width: d.size,
            height: d.size,
            boxShadow: "0 0 6px rgba(227,200,138,0.6)",
          }}
          initial={{ y: 0, x: 0, opacity: 0 }}
          animate={{
            // 从底部缓缓上浮出顶部，横向轻微漂移
            y: ["0vh", "-110vh"],
            x: [0, d.drift, -d.drift * 0.6, 0],
            opacity: [0, d.opacity, d.opacity, 0],
          }}
          transition={{
            duration: d.duration,
            delay: d.delay,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}
    </div>
  );
}
