"use client";

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { siteConfig } from "@/config/site";

// 名字交融过场（带无缝衔接）：开场红绒幕拉开后、请柬正文入场前的「仪式高潮」。
//   1) 「徐俊杰」自左、「鲍阳阳」自右滑入中线，中心金线相连、绽放小囍 + 金环；
//   2) 交汇完成后读取请柬里名字行的最终坐标（FLIP），把名字 + 囍平移缩放到那一行的位置；
//   3) 到位瞬间通过 onDone 通知父级让请柬名字行显形，本过场层随即隐藏——交接重合，肉眼无缝。
//
// nameRowRef：请柬名字行容器 ref，用于读取 [data-fusion-groom|mid|bride] 三个落点坐标。
// 尊重 prefers-reduced-motion：关闭动画时直接跳过、立即放行。

// 一个落点的目标几何：相对屏幕中心的位移 + 相对过场字号的缩放
type Target = { x: number; y: number; scale: number };

export function NameFusion({
  nameRowRef,
  onDone,
}: {
  nameRowRef: RefObject<HTMLDivElement | null>;
  onDone?: () => void;
}) {
  const reduce = useReducedMotion();
  const [show, setShow] = useState(true);
  // 阶段：'enter' 滑入交汇 → 'flip' 飞向请柬最终位置
  const [phase, setPhase] = useState<"enter" | "flip">("enter");
  // 三个元素 FLIP 的目标几何（读不到则维持居中、轻淡出兜底）
  const [targets, setTargets] = useState<{
    groom: Target;
    mid: Target;
    bride: Target;
  } | null>(null);

  const { groom, bride } = siteConfig.couple;
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduce) {
      setShow(false);
      onDone?.();
      return;
    }

    // 滑入 + 交汇绽放后，量取请柬名字行落点并切到 FLIP 阶段。
    // 1.25s：此时请柬名字行的入场淡入(custom=3, delay≈0.51s+0.6s)已结束、布局静止，坐标稳定。
    const tFlip = window.setTimeout(() => {
      const measure = computeTargets(nameRowRef.current);
      setTargets(measure);
      setPhase("flip");
    }, 1250);

    // FLIP 到位（约 0.6s 飞行）→ 先交棒（请柬名字行显形），再隐藏本层，避免空档闪烁
    const tHand = window.setTimeout(() => onDone?.(), 1880);
    const tDone = window.setTimeout(() => setShow(false), 1960);

    return () => {
      window.clearTimeout(tFlip);
      window.clearTimeout(tHand);
      window.clearTimeout(tDone);
    };
  }, [reduce, onDone, nameRowRef]);

  // 交汇瞬间向四周迸发的金色光点
  const sparks = Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * Math.PI * 2;
    const radius = 64 + ((i * 23) % 40);
    return { id: i, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });

  // 过场阶段名字相对屏幕中心的「滑入到位」横向偏移（FLIP 前的起点）
  const ENTER_X = 78;
  const flipping = phase === "flip" && targets;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          ref={rootRef}
          key="name-fusion"
          aria-hidden="true"
          className="fixed inset-0 z-[95] flex items-center justify-center overflow-hidden bg-china-red-deep"
          initial={{ opacity: 1 }}
          // FLIP 阶段背景红幕淡出，露出底下的请柬；名字本身另行飞向落点
          animate={{ opacity: flipping ? 0 : 1 }}
          transition={{ duration: flipping ? 0.5 : 0, ease: "easeInOut" }}
        >
          {/* 背景隐约囍字水印 */}
          <span className="font-kai pointer-events-none absolute -left-10 top-[26%] select-none text-[16rem] leading-none text-china-gold/5">
            囍
          </span>
          <span className="font-kai pointer-events-none absolute -right-12 top-[56%] select-none text-[18rem] leading-none text-china-gold/5">
            囍
          </span>

          {/* 交汇舞台：以屏幕正中为基准坐标系，三元素从中心各自飞向请柬落点 */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-0 w-0">
            {/* 连接金线：交汇瞬间拉开，FLIP 时淡出 */}
            <motion.span
              className="absolute left-1/2 top-1/2 h-px -translate-x-1/2 -translate-y-1/2"
              style={{
                background:
                  "linear-gradient(90deg, transparent, var(--china-gold-bright), transparent)",
                boxShadow: "0 0 8px rgba(227,200,138,0.7)",
              }}
              initial={{ width: 0, opacity: 0 }}
              animate={
                flipping
                  ? { opacity: 0 }
                  : { width: [0, 280], opacity: [0, 1, 0.6] }
              }
              transition={{ duration: 0.6, ease: "easeOut", delay: flipping ? 0 : 0.2 }}
            />

            {/* 中心交汇特效（金环 + 迸发光点），仅 enter 阶段 */}
            {!flipping && (
              <>
                <motion.span
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-china-gold-bright"
                  style={{ width: 40, height: 40 }}
                  initial={{ opacity: 0, scale: 0.3 }}
                  animate={{ opacity: [0, 0.9, 0], scale: [0.3, 2.6, 3.4] }}
                  transition={{ duration: 0.9, ease: "easeOut", delay: 0.2 }}
                />
                {sparks.map((s) => (
                  <motion.span
                    key={s.id}
                    className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-china-gold-bright"
                    style={{ boxShadow: "0 0 6px rgba(227,200,138,0.9)" }}
                    initial={{ opacity: 0, x: 0, y: 0, scale: 0 }}
                    animate={{ opacity: [0, 1, 0], x: [0, s.x], y: [0, s.y], scale: [0, 1, 0.3] }}
                    transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
                  />
                ))}
              </>
            )}

            {/* 新郎名：滑入到中线左侧 → FLIP 飞到请柬落点 */}
            <motion.span
              className="font-kai absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-china-text text-3xl md:text-5xl font-semibold tracking-wide"
              style={{ textShadow: "0 0 12px rgba(227,200,138,0.4)" }}
              initial={{ x: "-46vw", y: 0, opacity: 0, scale: 1 }}
              animate={
                flipping
                  ? { x: targets!.groom.x, y: targets!.groom.y, scale: targets!.groom.scale, opacity: 1 }
                  : { x: -ENTER_X, y: 0, opacity: 1, scale: 1 }
              }
              transition={
                flipping
                  ? { duration: 0.6, ease: [0.4, 0, 0.2, 1] }
                  : { duration: 0.9, ease: [0.4, 0, 0.2, 1] }
              }
            >
              {groom.name}
            </motion.span>

            {/* 中心囍字：绽放后 → FLIP 飞到名字行中间 */}
            <motion.span
              className="font-kai absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none text-china-gold-bright leading-none"
              style={{ fontWeight: 700, textShadow: "0 0 14px rgba(227,200,138,0.7)" }}
              initial={{ fontSize: "2.4rem", opacity: 0, scale: 0 }}
              animate={
                flipping
                  ? {
                      x: targets!.mid.x,
                      y: targets!.mid.y,
                      scale: targets!.mid.scale,
                      opacity: 1,
                    }
                  : { fontSize: "2.4rem", opacity: 1, scale: [0, 1.25, 1] }
              }
              transition={
                flipping
                  ? { duration: 0.6, ease: [0.4, 0, 0.2, 1] }
                  : { duration: 0.6, ease: "easeOut", delay: 0.2 }
              }
            >
              囍
            </motion.span>

            {/* 新娘名：滑入到中线右侧 → FLIP 飞到请柬落点 */}
            <motion.span
              className="font-kai absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-china-text text-3xl md:text-5xl font-semibold tracking-wide"
              style={{ textShadow: "0 0 12px rgba(227,200,138,0.4)" }}
              initial={{ x: "46vw", y: 0, opacity: 0, scale: 1 }}
              animate={
                flipping
                  ? { x: targets!.bride.x, y: targets!.bride.y, scale: targets!.bride.scale, opacity: 1 }
                  : { x: ENTER_X, y: 0, opacity: 1, scale: 1 }
              }
              transition={
                flipping
                  ? { duration: 0.6, ease: [0.4, 0, 0.2, 1] }
                  : { duration: 0.9, ease: [0.4, 0, 0.2, 1] }
              }
            >
              {bride.name}
            </motion.span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// 读取请柬名字行三个落点相对「屏幕中心」的位移与缩放。
// 过场层三元素都以屏幕正中（left/top 50%）为锚点，故位移 = 目标中心 − 屏幕中心。
// 缩放 = 目标字号 / 过场字号（用元素实际高度近似，避免读 computed font-size 的折算差）。
function computeTargets(row: HTMLDivElement | null) {
  if (typeof window === "undefined" || !row) return null;
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;

  const groomEl = row.querySelector<HTMLElement>("[data-fusion-groom]");
  const midEl = row.querySelector<HTMLElement>("[data-fusion-mid]");
  const brideEl = row.querySelector<HTMLElement>("[data-fusion-bride]");
  if (!groomEl || !midEl || !brideEl) return null;

  // 过场中名字字号约 text-3xl(30px)/md:text-5xl(48px)；这里按窄屏 3xl 估算高度基准。
  // 用目标元素自身高度比来求缩放，名字与囍各自单独算，贴合度最好。
  const nameFusionPx = 30; // 过场名字 text-3xl 行高近似
  const midFusionPx = 38; // 过场囍 2.4rem ≈ 38px

  const toTarget = (el: HTMLElement, fusionPx: number): Target => {
    const r = el.getBoundingClientRect();
    return {
      x: r.left + r.width / 2 - cx,
      y: r.top + r.height / 2 - cy,
      scale: Math.max(0.4, Math.min(1.4, r.height / fusionPx)),
    };
  };

  return {
    groom: toTarget(groomEl, nameFusionPx),
    mid: toTarget(midEl, midFusionPx),
    bride: toTarget(brideEl, nameFusionPx),
  };
}
