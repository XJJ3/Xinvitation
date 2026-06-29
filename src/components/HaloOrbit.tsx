"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useMounted } from "@/lib/useMounted";

// 囍字环绕光轨：一圈金色光粒绕中心缓慢公转，像光环围绕。
// 作为绝对定位层叠在囍字背后。尊重 prefers-reduced-motion：关闭时不渲染。
export function HaloOrbit({ size = 200 }: { size?: number }) {
  const reduce = useReducedMotion();
  const mounted = useMounted();
  // 挂载前（含 SSR）统一返回 null，与客户端首渲一致，避免 useReducedMotion 引发 hydration 不匹配。
  if (!mounted || reduce) return null;

  // 8 颗光粒均匀分布在圆周上，整体旋转
  const dots = Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * Math.PI * 2;
    const r = size / 2;
    return {
      i,
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
      // 交替大小，错落有致
      d: i % 2 === 0 ? 4 : 2.5,
    };
  });

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{ width: size, height: size }}
    >
      {/* 整圈缓慢公转 */}
      <motion.div
        className="absolute inset-0"
        animate={{ rotate: 360 }}
        transition={{ duration: 28, repeat: Infinity, ease: "linear" }}
      >
        {dots.map((d) => (
          <motion.span
            key={d.i}
            className="absolute left-1/2 top-1/2 rounded-full bg-china-gold-bright"
            style={{
              width: d.d,
              height: d.d,
              x: d.x,
              y: d.y,
              boxShadow: "0 0 6px rgba(227,200,138,0.8)",
            }}
            // 每颗光粒自身明暗呼吸，错峰闪烁
            animate={{ opacity: [0.3, 0.9, 0.3] }}
            transition={{
              duration: 2.6,
              repeat: Infinity,
              ease: "easeInOut",
              delay: (d.i / dots.length) * 2.6,
            }}
          />
        ))}
      </motion.div>
    </div>
  );
}
