"use client";

import { useRef } from "react";
import type { RefObject } from "react";
import { motion } from "framer-motion";
import { siteConfig } from "@/config/site";
import { CornerOrnament } from "./Ornaments";
import { InteractiveDoubleHappiness } from "./InteractiveDoubleHappiness";
import { ClickFireworks } from "./ClickFireworks";
import { HaloOrbit } from "./HaloOrbit";
// import { ExportButton } from "./ExportButton"; // 保存图片按钮暂时隐藏

// 第一屏：纯文字红金请柬（对应参考图1）
// start：开场序幕揭开后才置 true，触发逐段入场动画（避免序幕期间就演完）
// nameRowRef：名字行容器 ref，供名字交融过场量取最终落点做无缝衔接（FLIP）。
// nameRowHidden：过场尚未交棒时，名字行保持隐形（占位但不可见），交棒后显形。
export function InviteCard({
  start = true,
  nameRowRef,
  nameRowHidden = false,
}: {
  start?: boolean;
  nameRowRef?: RefObject<HTMLDivElement | null>;
  nameRowHidden?: boolean;
}) {
  const { groom, bride } = siteConfig.couple;
  const { event, hero } = siteConfig;
  const cardRef = useRef<HTMLElement>(null);
  const anim = start ? "show" : "hidden";

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
      {/* 边框流光：一道极淡的金色高光沿对角缓缓扫过（只在边框描边上可见） */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-4 border border-transparent"
        style={{
          // 只给边框上色：用 border-image 渐变 + 移动的背景位置模拟流光
          borderImage:
            "linear-gradient(120deg, transparent 30%, rgba(227,200,138,0.85) 50%, transparent 70%) 1",
        }}
        animate={{ opacity: [0, 0.9, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", repeatDelay: 2 }}
      />

      {/* 四角角花 */}
      <CornerOrnament className="pointer-events-none absolute top-3 left-3 w-14 h-14 text-china-gold" />
      <CornerOrnament className="pointer-events-none absolute top-3 right-3 w-14 h-14 text-china-gold -scale-x-100" />
      <CornerOrnament className="pointer-events-none absolute bottom-3 left-3 w-14 h-14 text-china-gold -scale-y-100" />
      <CornerOrnament className="pointer-events-none absolute bottom-3 right-3 w-14 h-14 text-china-gold -scale-100" />

      {/* 点击绽放烟花层（点请柬任意处迸出金红烟花，按钮/链接除外） */}
      <ClickFireworks />

      <div className="relative z-10 w-full max-w-sm mx-auto text-center flex flex-col items-center">
        {/* 大囍字（可点击：呼吸光晕 + 点击金色波纹）+ 环绕光轨 */}
        <motion.div
          custom={0}
          variants={fade}
          initial="hidden"
          animate={anim}
          className="relative"
        >
          <HaloOrbit size={210} />
          <InteractiveDoubleHappiness className="text-china-gold text-8xl md:text-9xl" />
        </motion.div>

        {/* 英文欢迎语 */}
        <motion.p
          custom={1}
          variants={fade}
          initial="hidden"
          animate={anim}
          className="font-serif text-china-text-soft tracking-[0.12em] text-[0.7rem] md:text-sm mt-6 px-2 max-w-full wrap-break-word"
        >
          {hero.welcomeEn}
        </motion.p>

        {/* 中文标题 */}
        <motion.h1
          custom={2}
          variants={fade}
          initial="hidden"
          animate={anim}
          className="font-kai text-china-text text-2xl md:text-3xl font-semibold tracking-wide mt-5"
        >
          {hero.title}
        </motion.h1>

        {/* 新人姓名（横排并列，中间金色囍字）。
            名字交融过场会把名字飞到这一行的最终位置后交棒，故这里挂 ref + data 标记供量坐标。 */}
        <motion.div
          custom={3}
          variants={fade}
          initial="hidden"
          animate={anim}
          className="mt-10"
        >
          <div
            ref={nameRowRef}
            className={`flex items-center justify-center gap-3 transition-opacity duration-300 md:gap-4 ${
              nameRowHidden ? "opacity-0" : "opacity-100"
            }`}
          >
            <span
              data-fusion-groom
              className="font-kai text-china-text text-3xl md:text-4xl font-semibold"
            >
              <ShimmerName name={groom.name} delay={0} />
            </span>
            <span
              data-fusion-mid
              className="font-kai text-china-gold-bright text-2xl md:text-3xl font-semibold leading-none"
              style={{ textShadow: "0 0 10px rgba(227,200,138,0.5)" }}
            >
              囍
            </span>
            <span
              data-fusion-bride
              className="font-kai text-china-text text-3xl md:text-4xl font-semibold"
            >
              <ShimmerName name={bride.name} delay={2.2} />
            </span>
          </div>
        </motion.div>

        {/* 日期 + 双场次（午宴 / 晚宴）地址与时间 */}
        <motion.div
          custom={4}
          variants={fade}
          initial="hidden"
          animate={anim}
          className="font-kai text-china-text-soft mt-12 space-y-4 text-base md:text-lg leading-relaxed wrap-break-word"
        >
          {/* 日期 */}
          <p className="text-china-text">
            {new Date(event.date).toLocaleDateString("zh-CN", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}{" "}
            {event.weekday}
          </p>
          <p>{event.lunar}</p>

          {/* 两场宴席 */}
          <div className="space-y-4 pt-2">
            {event.banquets.map((b) => (
              <div key={b.label} className="space-y-1">
                <p className="text-china-gold-bright tracking-wide">
                  {b.label} · {b.time}
                </p>
                <p className="text-sm md:text-base">{b.venue}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* 藏头诗 */}
        <motion.div
          custom={5}
          variants={fade}
          initial="hidden"
          animate={anim}
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
          animate={anim}
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
          animate={anim}
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

      {/* 导出按钮（截图时自身隐藏）—— 暂时隐藏 */}
      {/* <ExportButton targetRef={cardRef} fileName="订婚请帖-邀请卡" /> */}
    </section>
  );
}

// 人名：底色为米白文字，一道金色高光每隔几秒缓缓掠过（精致克制，不常亮）。
// 用 background-clip:text 把移动的高光渐变贴到文字上。
function ShimmerName({ name, delay }: { name: string; delay: number }) {
  return (
    <motion.span
      className="inline-block bg-clip-text"
      style={{
        backgroundImage:
          "linear-gradient(110deg, var(--china-text) 0%, var(--china-text) 38%, var(--china-gold-bright) 50%, var(--china-text) 62%, var(--china-text) 100%)",
        backgroundSize: "260% 100%",
        WebkitTextFillColor: "transparent",
        color: "transparent",
      }}
      animate={{ backgroundPosition: ["120% 0%", "-20% 0%"] }}
      transition={{
        duration: 1.6,
        ease: "easeInOut",
        repeat: Infinity,
        repeatDelay: 4.5, // 掠过一次后停 4.5s，偶发不抢戏
        delay,
      }}
    >
      {name}
    </motion.span>
  );
}
