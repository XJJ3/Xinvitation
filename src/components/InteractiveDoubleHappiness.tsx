"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// 可交互的「囍」字（用于第一屏）：
// - 常态：缓慢的呼吸光晕（drop-shadow 明暗起伏），像在轻轻发光
// - 点击：自身轻弹一下 + 迸出一圈金色波纹（精致克制的交互反馈）
export function InteractiveDoubleHappiness({ className = "" }: { className?: string }) {
  // 每次点击塞一个递增 id，触发一圈波纹；动画结束自行移除
  const [ripples, setRipples] = useState<number[]>([]);
  const [bump, setBump] = useState(0); // 点击轻弹的触发计数

  const handleTap = () => {
    setRipples((r) => [...r, (r[r.length - 1] ?? 0) + 1]);
    setBump((b) => b + 1);
  };

  return (
    <button
      type="button"
      onClick={handleTap}
      aria-label="双喜"
      className="relative inline-flex cursor-pointer items-center justify-center bg-transparent"
    >
      {/* 点击波纹：一圈金色光环扩散淡出 */}
      <AnimatePresence>
        {ripples.map((id) => (
          <motion.span
            key={id}
            className="pointer-events-none absolute rounded-full border border-china-gold-bright"
            style={{ width: "1.2em", height: "1.2em" }}
            initial={{ opacity: 0.7, scale: 0.6 }}
            animate={{ opacity: 0, scale: 2.6 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
            onAnimationComplete={() =>
              setRipples((r) => r.filter((x) => x !== id))
            }
          />
        ))}
      </AnimatePresence>

      {/* 囍字本体：常态呼吸光晕；点击时（bump 变化）轻弹一下 */}
      <motion.span
        key={bump}
        className={`font-kai leading-none select-none ${className}`}
        style={{ fontWeight: 700 }}
        // 常态：缓慢呼吸的金色光晕
        animate={{
          filter: [
            "drop-shadow(0 2px 8px rgba(0,0,0,0.3)) drop-shadow(0 0 6px rgba(227,200,138,0.25))",
            "drop-shadow(0 2px 8px rgba(0,0,0,0.3)) drop-shadow(0 0 16px rgba(227,200,138,0.55))",
            "drop-shadow(0 2px 8px rgba(0,0,0,0.3)) drop-shadow(0 0 6px rgba(227,200,138,0.25))",
          ],
        }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        // 点击轻弹：用 whileTap 兜底，bump 的 key 变化触发一次缩放回弹
        whileTap={{ scale: 0.9 }}
      >
        囍
      </motion.span>
    </button>
  );
}
