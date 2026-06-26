"use client";

import { useRef } from "react";
import { motion } from "framer-motion";
import { siteConfig } from "@/config/site";
import { CornerOrnament, DoubleHappiness } from "./Ornaments";
import { ExportButton } from "./ExportButton";

// 第一屏：纯文字红金请柬（对应参考图1）
export function InviteCard() {
  const { groom, bride } = siteConfig.couple;
  const { event, hero } = siteConfig;
  const cardRef = useRef<HTMLElement>(null);

  // 入场动画：自上而下逐段淡入
  const fade = {
    hidden: { opacity: 0, y: 16 },
    show: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, delay: 0.15 + i * 0.12, ease: "easeOut" as const },
    }),
  };

  return (
    <section ref={cardRef} className="relative min-h-screen w-full bg-gradient-to-b from-china-red to-china-red-deep flex items-center justify-center px-8 py-12 overflow-x-clip">
      {/* 背景隐约「囍」字水印（与第二屏一致），错落散布、极低透明度 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden select-none"
      >
        <span className="font-kai absolute -left-10 top-[28%] text-[16rem] leading-none text-china-gold/4">
          囍
        </span>
        <span className="font-kai absolute -right-12 top-[55%] text-[18rem] leading-none text-china-gold/4">
          囍
        </span>
        <span className="font-kai absolute left-1/3 bottom-[3%] text-[14rem] leading-none text-china-gold/3">
          囍
        </span>
      </div>

      {/* 金色双层边框 */}
      <div className="pointer-events-none absolute inset-4 border border-china-gold/70" />
      <div className="pointer-events-none absolute inset-5 border border-china-gold/30" />

      {/* 四角角花 */}
      <CornerOrnament className="pointer-events-none absolute top-3 left-3 w-14 h-14 text-china-gold" />
      <CornerOrnament className="pointer-events-none absolute top-3 right-3 w-14 h-14 text-china-gold -scale-x-100" />
      <CornerOrnament className="pointer-events-none absolute bottom-3 left-3 w-14 h-14 text-china-gold -scale-y-100" />
      <CornerOrnament className="pointer-events-none absolute bottom-3 right-3 w-14 h-14 text-china-gold -scale-100" />

      <div className="relative z-10 w-full max-w-sm mx-auto text-center flex flex-col items-center overflow-hidden">
        {/* 大囍字 */}
        <motion.div custom={0} variants={fade} initial="hidden" animate="show">
          <DoubleHappiness className="text-china-gold text-8xl md:text-9xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.3)]" />
        </motion.div>

        {/* 英文欢迎语 */}
        <motion.p
          custom={1}
          variants={fade}
          initial="hidden"
          animate="show"
          className="font-serif text-china-text-soft tracking-[0.12em] text-[0.7rem] md:text-sm mt-6 px-2 max-w-full wrap-break-word"
        >
          {hero.welcomeEn}
        </motion.p>

        {/* 中文标题 */}
        <motion.h1
          custom={2}
          variants={fade}
          initial="hidden"
          animate="show"
          className="font-kai text-china-text text-2xl md:text-3xl font-semibold tracking-wide mt-5"
        >
          {hero.title}
        </motion.h1>

        {/* 新人姓名（竖排 AND 分隔） */}
        <motion.div
          custom={3}
          variants={fade}
          initial="hidden"
          animate="show"
          className="mt-10 space-y-3"
        >
          <p className="font-kai text-china-text text-3xl md:text-4xl font-semibold">
            {groom.name}
          </p>
          <p className="font-serif text-china-text-soft tracking-[0.3em] text-sm">
            AND
          </p>
          <p className="font-kai text-china-text text-3xl md:text-4xl font-semibold">
            {bride.name}
          </p>
        </motion.div>

        {/* 地址与日期 */}
        <motion.div
          custom={4}
          variants={fade}
          initial="hidden"
          animate="show"
          className="font-kai text-china-text-soft mt-12 space-y-3 text-base md:text-lg leading-relaxed wrap-break-word"
        >
          <p>地址：{event.venue}</p>
          <p>
            {new Date(event.date).toLocaleDateString("zh-CN", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}{" "}
            {event.weekday}
          </p>
          <p>{event.lunar}</p>
          <p>{event.timeLabel}</p>
        </motion.div>

        {/* 藏头诗 */}
        <motion.div
          custom={5}
          variants={fade}
          initial="hidden"
          animate="show"
          className="font-mincho text-china-gold-bright mt-12 space-y-2 text-lg md:text-xl"
        >
          {hero.poem.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </motion.div>

        {/* 英文诗句 */}
        <motion.div
          custom={6}
          variants={fade}
          initial="hidden"
          animate="show"
          className="font-serif italic text-china-text-soft mt-10 space-y-1 text-sm md:text-base leading-relaxed px-2 max-w-full wrap-break-word"
        >
          {hero.quoteEn.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </motion.div>

        {/* 底部 WELCOME */}
        <motion.p
          custom={7}
          variants={fade}
          initial="hidden"
          animate="show"
          className="font-serif text-china-gold tracking-[0.4em] text-sm mt-12 flex items-center gap-3"
        >
          <span className="w-6 h-px bg-china-gold/60" />
          {hero.footerEn}
          <span className="w-6 h-px bg-china-gold/60" />
        </motion.p>

        {/* 下滑提示 */}
        <motion.div
          data-export-hide
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0.3, 1] }}
          transition={{ delay: 1.8, duration: 2, repeat: Infinity }}
          className="mt-8 text-china-gold/70 text-xs tracking-widest"
        >
          下滑查看更多 ⌄
        </motion.div>
      </div>

      {/* 导出按钮（截图时自身隐藏） */}
      <ExportButton targetRef={cardRef} fileName="订婚请帖-邀请卡" />
    </section>
  );
}
