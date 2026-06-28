"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

// 双击送祝福的引导：请柬入场后浮现一个金边药丸标签「双击屏幕，为新人送上祝福 ♡」，
// 带轻轻的呼吸动效。一旦宾客首次双击（收到 guest-blessed 事件）即优雅隐去——
// 说明对方已 get 到玩法，无需再提示；若一直没双击，也会在停留一段时间后自动淡出。
// 尊重 prefers-reduced-motion：关闭动画时不渲染（彩蛋本身也已禁用）。
export function EasterEggHint({ start = false }: { start?: boolean }) {
  const reduce = useReducedMotion();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (reduce || !start) return;
    // 请柬入场稳定后浮现，停留约 12s 自动隐去（足够看清又不长期占屏）
    const tIn = window.setTimeout(() => setVisible(true), 2600);
    const tOut = window.setTimeout(() => setVisible(false), 14600);

    // 宾客首次双击送出祝福 → 立即隐去提示
    const onBlessed = () => setVisible(false);
    window.addEventListener("guest-blessed", onBlessed);

    return () => {
      window.clearTimeout(tIn);
      window.clearTimeout(tOut);
      window.removeEventListener("guest-blessed", onBlessed);
    };
  }, [reduce, start]);

  if (reduce) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          {/* 金边药丸标签 + 缓慢呼吸光晕 */}
          <motion.div
            className="flex items-center gap-2 rounded-full border border-china-gold/60 bg-china-red-deep/75 px-4 py-2 backdrop-blur-sm"
            animate={{
              boxShadow: [
                "0 2px 10px rgba(0,0,0,0.3), 0 0 4px rgba(227,200,138,0.25)",
                "0 2px 10px rgba(0,0,0,0.3), 0 0 16px rgba(227,200,138,0.6)",
                "0 2px 10px rgba(0,0,0,0.3), 0 0 4px rgba(227,200,138,0.25)",
              ],
            }}
            transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
          >
            {/* 双击手势图标：两圈轻轻扩散，呼应「双击」 */}
            <span className="relative flex h-4 w-4 items-center justify-center">
              <motion.span
                className="absolute h-3 w-3 rounded-full border border-china-gold-bright"
                animate={{ opacity: [0.7, 0], scale: [0.6, 1.8] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
              />
              <span className="h-1.5 w-1.5 rounded-full bg-china-gold-bright" />
            </span>
            <span className="font-kai text-[13px] tracking-wide text-china-gold-bright">
              双击屏幕，为新人送上祝福
            </span>
            <span className="text-[12px] text-china-gold-bright">♡</span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
