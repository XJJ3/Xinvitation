"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";

// 持续氛围（极克制）：少量金箔/花瓣自顶部缓缓飘落，左右轻摆 + 自转，
// 与上浮的金粉（GoldDust）形成上下对流的空间层次。数量很少、透明度很低，不抢戏。
// 尊重 prefers-reduced-motion：关闭动画时不渲染。
export function FloatingPetals({ count = 10 }: { count?: number }) {
  const reduce = useReducedMotion();

  // 确定性伪随机（避免 Math.random，保证 SSR/CSR 一致）
  const petals = useMemo(() => {
    const rnd = (seed: number) => {
      const x = Math.sin(seed) * 10000;
      return x - Math.floor(x);
    };
    return Array.from({ length: count }, (_, i) => {
      const left = rnd(i + 3) * 100; // 横向起点 %
      const size = 6 + rnd(i + 19) * 7; // 金箔尺寸 px
      const duration = 16 + rnd(i + 37) * 14; // 单次飘落时长 s
      const delay = -rnd(i + 59) * duration; // 负延迟：进场即铺满
      const sway = 24 + rnd(i + 73) * 40; // 横向摆幅 px
      const spin = (rnd(i + 89) > 0.5 ? 1 : -1) * (180 + rnd(i + 97) * 220); // 自转角度
      const opacity = 0.1 + rnd(i + 103) * 0.22; // 峰值透明度（很淡）
      return { id: i, left, size, duration, delay, sway, spin, opacity };
    });
  }, [count]);

  if (reduce) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[5] overflow-hidden select-none"
    >
      {petals.map((p) => (
        <motion.span
          key={p.id}
          className="absolute"
          style={{
            left: `${p.left}%`,
            top: -20,
            width: p.size,
            height: p.size * 0.7,
            // 金箔：椭圆花瓣形，金色径向高光
            borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%",
            background:
              "radial-gradient(circle at 35% 30%, var(--china-gold-bright), var(--china-gold) 70%, rgba(201,168,106,0.4))",
            boxShadow: "0 0 4px rgba(227,200,138,0.4)",
          }}
          initial={{ y: 0, x: 0, rotate: 0, opacity: 0 }}
          animate={{
            // 自顶部飘落出底部，横向左右轻摆，同时自转
            y: ["0vh", "112vh"],
            x: [0, p.sway, -p.sway * 0.7, p.sway * 0.4, 0],
            rotate: [0, p.spin],
            opacity: [0, p.opacity, p.opacity, 0],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}
    </div>
  );
}
