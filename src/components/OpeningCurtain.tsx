"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

// 开场序幕：金色「囍」印章自上方落下、盖印瞬间金光迸发 + 金粉四溅，
// 印章盖定后，两幅剧院红绒幕「束起掠开」——下摆向中线收束、整幅向外掠开，
// 露出下面的请柬。整段约 2.8s，仅一次。
//
// 用法：放在页面最外层。动画结束后通过 onDone 通知父级触发请柬入场。
// 尊重 prefers-reduced-motion：若用户关闭动画，直接跳过序幕。
export function OpeningCurtain({ onDone }: { onDone?: () => void }) {
  const reduce = useReducedMotion();
  const [show, setShow] = useState(true);
  // parting：印章盖定后置 true，触发两幅红绒幕束起掠开
  const [parting, setParting] = useState(false);

  useEffect(() => {
    // 关闭动画偏好：不演序幕，立即放行
    if (reduce) {
      setShow(false);
      onDone?.();
      return;
    }
    // 盖印 + 金光收尾后开始拉幕
    const tPart = setTimeout(() => setParting(true), 1500);
    // 整段结束后卸载覆盖层并放行请柬入场
    const tDone = setTimeout(() => {
      setShow(false);
      onDone?.();
    }, 2800);
    return () => {
      clearTimeout(tPart);
      clearTimeout(tDone);
    };
  }, [reduce, onDone]);

  // 印章盖下的时刻（金光与金粉在此刻迸发）
  const STAMP_AT = 0.9;

  // 迸发的金粉颗粒：从中心向四周飞散
  const sparks = Array.from({ length: 18 }, (_, i) => {
    const angle = (i / 18) * Math.PI * 2;
    // 用确定性的伪随机半径，避免 Math.random（SSR 一致性 + 稳定）
    const radius = 90 + ((i * 37) % 70);
    return {
      id: i,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  });

  const partEase = [0.62, 0, 0.2, 1] as const;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="curtain"
          aria-hidden="true"
          className="fixed inset-0 z-[100] overflow-hidden"
          style={{ perspective: 1200 }}
        >
          {/* === 左右两幅红绒幕 === */}
          <Drape side="left" parting={parting} stampAt={STAMP_AT} ease={partEase} />
          <Drape side="right" parting={parting} stampAt={STAMP_AT} ease={partEase} />

          {/* 隐约囍字水印，和请柬背景呼应（随帷幕一起淡出，避免拉开后悬空） */}
          <motion.div
            className="pointer-events-none absolute inset-0 overflow-hidden select-none"
            animate={parting ? { opacity: 0 } : { opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            <span className="font-kai absolute -left-10 top-[28%] text-[16rem] leading-none text-china-gold/5">
              囍
            </span>
            <span className="font-kai absolute -right-12 top-[55%] text-[18rem] leading-none text-china-gold/5">
              囍
            </span>
          </motion.div>

          {/* 居中印章舞台（拉幕时整体淡出，让位给请柬） */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            animate={parting ? { opacity: 0, scale: 0.92 } : { opacity: 1, scale: 1 }}
            transition={{ duration: 0.45, ease: "easeIn" }}
          >
            <div className="relative flex items-center justify-center">
              {/* 盖印瞬间迸发的金光圆环 */}
              <motion.div
                className="absolute rounded-full"
                style={{
                  width: 220,
                  height: 220,
                  background:
                    "radial-gradient(circle, rgba(227,200,138,0.55) 0%, rgba(201,168,106,0.25) 40%, transparent 70%)",
                }}
                initial={{ opacity: 0, scale: 0.2 }}
                animate={{ opacity: [0, 0, 0.9, 0], scale: [0.2, 0.2, 1.8, 2.4] }}
                transition={{
                  duration: 2,
                  times: [0, STAMP_AT / 2, STAMP_AT / 2 + 0.12, STAMP_AT / 2 + 0.45],
                  ease: "easeOut",
                }}
              />

              {/* 四溅的金粉颗粒 */}
              {sparks.map((s) => (
                <motion.span
                  key={s.id}
                  className="absolute h-1.5 w-1.5 rounded-full bg-china-gold-bright"
                  style={{ boxShadow: "0 0 6px rgba(227,200,138,0.9)" }}
                  initial={{ opacity: 0, x: 0, y: 0, scale: 0 }}
                  animate={{
                    opacity: [0, 0, 1, 0],
                    x: [0, 0, s.x, s.x * 1.2],
                    y: [0, 0, s.y, s.y * 1.2 + 24],
                    scale: [0, 0, 1, 0.3],
                  }}
                  transition={{
                    duration: 2,
                    times: [0, STAMP_AT / 2, STAMP_AT / 2 + 0.18, STAMP_AT / 2 + 0.5],
                    ease: "easeOut",
                  }}
                />
              ))}

              {/* 印章本体：自上方落下、轻微回弹，盖定时一震 */}
              <motion.div
                className="relative flex h-32 w-32 items-center justify-center rounded-2xl border-[3px] border-china-gold bg-china-red shadow-[0_8px_30px_rgba(0,0,0,0.45)]"
                initial={{ y: -360, opacity: 0, scale: 1.15, rotate: -6 }}
                animate={{
                  y: [-360, 0, -14, 0],
                  opacity: [0, 1, 1, 1],
                  scale: [1.15, 1, 1.04, 1],
                  rotate: [-6, 0, 0, 0],
                }}
                transition={{
                  duration: 1.1,
                  times: [0, STAMP_AT / 1.1, (STAMP_AT + 0.12) / 1.1, 1],
                  ease: [0.5, 0, 0.2, 1],
                }}
              >
                <span
                  className="font-kai text-china-gold leading-none"
                  style={{ fontSize: "4.5rem", fontWeight: 700 }}
                >
                  囍
                </span>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// 单幅红绒幕：剧院丝绒质感（多层纵向高光/暗谷）+ 顶部流苏挂帘 + 内侧金绣边。
// 拉开（parting）时「束起掠开」：下摆向中线收束（clip-path）、整幅向外掠开并轻微透视外翻。
function Drape({
  side,
  parting,
  stampAt,
  ease,
}: {
  side: "left" | "right";
  parting: boolean;
  stampAt: number;
  ease: readonly [number, number, number, number];
}) {
  const isLeft = side === "left";
  const inner = isLeft ? "right" : "left"; // 中线侧

  // 绒布丝缕：明暗相间、峰谷不等宽，叠出顺垂的天鹅绒褶皱（比均匀重复更自然）。
  const velvet =
    "linear-gradient(90deg," +
    "rgba(0,0,0,0.38) 0%," +
    "rgba(0,0,0,0.05) 4%," +
    "rgba(255,255,255,0.10) 7%," +
    "rgba(0,0,0,0.22) 12%," +
    "rgba(0,0,0,0.02) 18%," +
    "rgba(255,255,255,0.07) 23%," +
    "rgba(0,0,0,0.30) 30%," +
    "rgba(0,0,0,0.04) 37%," +
    "rgba(255,255,255,0.12) 43%," +
    "rgba(0,0,0,0.20) 50%," +
    "rgba(0,0,0,0.02) 57%," +
    "rgba(255,255,255,0.08) 63%," +
    "rgba(0,0,0,0.28) 70%," +
    "rgba(0,0,0,0.05) 78%," +
    "rgba(255,255,255,0.11) 84%," +
    "rgba(0,0,0,0.24) 91%," +
    "rgba(0,0,0,0.06) 96%," +
    "rgba(0,0,0,0.34) 100%)," +
    // 底色：上深下亮再到深，模拟绒布受光的纵向体面
    "linear-gradient(180deg, var(--china-red-deep) 0%, var(--china-red) 45%, var(--china-red-bright) 70%, var(--china-red) 88%, var(--china-red-deep) 100%)";

  // 束起：拉开时把幕布下摆向中线收成弧形（被金色绸带勒起的形状）
  const clipFlat = "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)";
  const clipBunched = isLeft
    ? // 左幅：右下角（中线侧底部）向内收束、上提
      "polygon(0% 0%, 100% 0%, 70% 100%, 0% 86%)"
    : "polygon(0% 0%, 100% 0%, 100% 86%, 30% 100%)";

  return (
    <motion.div
      className={`absolute inset-y-0 w-[52%] ${isLeft ? "left-0" : "right-0"}`}
      style={{ transformOrigin: `${isLeft ? "left" : "right"} center` }}
      initial={{ x: 0, rotateY: 0 }}
      animate={
        parting
          ? { x: isLeft ? "-104%" : "104%", rotateY: isLeft ? -14 : 14 }
          : { x: 0, rotateY: 0 }
      }
      transition={{ duration: 1.0, ease }}
    >
      {/* 收束容器：用 clip-path 在拉开时把下摆束成弧形 */}
      <motion.div
        className="relative h-full w-full"
        style={{ background: velvet }}
        initial={{ clipPath: clipFlat }}
        animate={{ clipPath: parting ? clipBunched : clipFlat }}
        transition={{ duration: 1.0, ease }}
      >
        {/* 盖印瞬间整幅一记亮红闪光 */}
        <motion.div
          className="absolute inset-0 bg-china-red-bright mix-blend-screen"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0, 0.45, 0] }}
          transition={{
            duration: 2,
            times: [0, stampAt / 2, stampAt / 2 + 0.04, stampAt / 2 + 0.18],
          }}
        />

        {/* 顶部流苏挂帘：一排金色小坠子 */}
        <div className={`absolute top-0 ${isLeft ? "left-0" : "right-0"} flex w-full justify-around px-1`}>
          {Array.from({ length: 9 }, (_, i) => (
            <span
              key={i}
              className="block w-px bg-gradient-to-b from-china-gold-bright to-transparent"
              style={{ height: 10 + ((i * 7) % 9) }}
            >
              <span className="mx-auto block h-1 w-1 -translate-x-px translate-y-full rounded-full bg-china-gold-bright" />
            </span>
          ))}
        </div>
        {/* 顶部金色横杆 */}
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-b from-china-gold-bright to-china-gold/40" />

        {/* 内侧（中线侧）金色绣边 + 发光 */}
        <div
          className={`absolute inset-y-0 ${inner}-0 w-[4px]`}
          style={{
            background:
              "linear-gradient(to " +
              (isLeft ? "left" : "right") +
              ", var(--china-gold-bright), rgba(201,168,106,0.2))",
            boxShadow: "0 0 10px rgba(227,200,138,0.5)",
          }}
        />
        {/* 内侧投影渐暗，增强立体垂坠感 */}
        <div
          className={`absolute inset-y-0 ${inner}-0 w-20`}
          style={{
            background:
              "linear-gradient(to " +
              (isLeft ? "left" : "right") +
              ", rgba(0,0,0,0.35), transparent)",
          }}
        />
      </motion.div>
    </motion.div>
  );
}
