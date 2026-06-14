"use client";

import { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { siteConfig } from "@/config/site";
import { CornerOrnament, HappinessSeal } from "./Ornaments";

// 第二屏：带新人合影的邀请函（对应参考图2）
export function PhotoCard() {
  const { groom, bride } = siteConfig.couple;
  const { event, photo } = siteConfig;
  // 真实照片缺失时回退到占位图
  const [imgSrc, setImgSrc] = useState(photo.src);

  return (
    <section className="relative min-h-screen w-full bg-gradient-to-b from-china-red-photo to-china-red-photo-deep flex flex-col items-center overflow-x-clip">
      {/* 背景隐约「囍」字水印（参考图2 的纹理感），错落散布、极低透明度 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden select-none"
      >
        <span className="font-kai absolute -left-10 top-[30%] text-[16rem] leading-none text-china-gold/4">
          囍
        </span>
        <span className="font-kai absolute -right-12 top-[52%] text-[18rem] leading-none text-china-gold/4">
          囍
        </span>
        <span className="font-kai absolute left-1/3 bottom-[2%] text-[14rem] leading-none text-china-gold/3">
          囍
        </span>
      </div>

      {/* 角花装饰 */}
      <CornerOrnament className="pointer-events-none absolute top-3 left-3 w-12 h-12 text-china-gold/80 z-20" />
      <CornerOrnament className="pointer-events-none absolute top-3 right-3 w-12 h-12 text-china-gold/80 -scale-x-100 z-20" />

      {/* 顶部照片，底部用半圆弧裁切 */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.9, ease: "easeOut" }}
        className="relative z-10 w-full h-[52vh] min-h-[360px] overflow-hidden"
        style={{
          // 底部弧形：用径向裁切模拟参考图的半圆切口
          WebkitMaskImage:
            "radial-gradient(140% 88% at 50% 0%, #000 70%, transparent 71%)",
          maskImage:
            "radial-gradient(140% 88% at 50% 0%, #000 70%, transparent 71%)",
        }}
      >
        <Image
          src={imgSrc}
          alt={`${groom.name} 与 ${bride.name} 合影`}
          fill
          priority
          sizes="100vw"
          className="object-cover"
          onError={() => setImgSrc("/photos/couple-placeholder.svg")}
        />
        {/* 照片底部红色渐隐，过渡到背景 */}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-b from-transparent to-china-red-photo/90" />
      </motion.div>

      {/* 圆形囍徽章，压在照片弧口上 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.6 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="-mt-9 z-10"
      >
        <HappinessSeal className="w-16 h-16 bg-china-red-photo text-2xl shadow-lg" />
      </motion.div>

      {/* 文字区 */}
      <div className="relative z-10 flex flex-col items-center text-center px-6 pb-16 mt-4 flex-1">
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="font-kai text-china-gold-bright text-3xl md:text-4xl font-semibold tracking-[0.15em]"
        >
          {photo.title}
        </motion.h2>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="font-kai text-china-text-soft text-base md:text-lg mt-4"
        >
          {photo.subtitle}
        </motion.p>

        {/* 新人姓名 + GROOM/BRIDE 标注 */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="flex items-start justify-center gap-6 md:gap-10 mt-10"
        >
          <div className="flex flex-col items-center">
            <span className="font-kai text-china-text text-2xl md:text-3xl font-semibold tracking-wide">
              {groom.name}
            </span>
            <span className="font-serif text-china-gold tracking-[0.25em] text-xs mt-2">
              {groom.role}
            </span>
          </div>
          <span className="font-kai text-china-gold text-2xl md:text-3xl mt-1">
            &amp;
          </span>
          <div className="flex flex-col items-center">
            <span className="font-kai text-china-text text-2xl md:text-3xl font-semibold tracking-wide">
              {bride.name}
            </span>
            <span className="font-serif text-china-gold tracking-[0.25em] text-xs mt-2">
              {bride.role}
            </span>
          </div>
        </motion.div>

        {/* 日期 */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.35 }}
          className="font-kai text-china-text-soft mt-10 space-y-2 text-lg md:text-xl"
        >
          <p>
            {new Date(event.date).toLocaleDateString("zh-CN", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}{" "}
            {event.weekday}
          </p>
          <p>
            {event.lunar.replace(/^.*农历/, "农历")} {event.timeLabel.replace(/[^\d:]/g, "")}
          </p>
        </motion.div>

        {/* 敬语 */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.45 }}
          className="flex items-center gap-10 md:gap-14 mt-12 font-kai text-china-gold-bright text-xl md:text-2xl"
        >
          {photo.blessings.map((b) => (
            <span key={b}>{b}</span>
          ))}
        </motion.div>

        {/* 地址 */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.55 }}
          className="font-kai text-china-text-soft text-base md:text-lg mt-10"
        >
          {event.venueShort}
        </motion.p>
      </div>
    </section>
  );
}
