"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

// 彩蛋极淡提示：请柬入场后短暂浮现一行引导，几秒后自动淡出，不常驻抢戏。
// 仅作「发现彩蛋」的轻提示；reduced-motion 下不渲染（彩蛋本身也已禁用）。
export function EasterEggHint({ start = false }: { start?: boolean }) {
  const reduce = useReducedMotion();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (reduce || !start) return;
    // 请柬入场稳定后再浮现，停留约 5s 自动隐去
    const tIn = window.setTimeout(() => setVisible(true), 2600);
    const tOut = window.setTimeout(() => setVisible(false), 8200);
    return () => {
      window.clearTimeout(tIn);
      window.clearTimeout(tOut);
    };
  }, [reduce, start]);

  if (reduce) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.p
          aria-hidden="true"
          className="font-kai pointer-events-none fixed inset-x-0 bottom-3 z-[60] text-center text-[11px] tracking-wide text-china-gold/40"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          ✨ 试试长按囍字，或双击屏幕
        </motion.p>
      )}
    </AnimatePresence>
  );
}
