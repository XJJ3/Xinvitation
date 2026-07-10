"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { siteConfig } from "@/config/site";
import { CornerOrnament } from "./Ornaments";
// import { ExportButton } from "./ExportButton"; // 保存图片按钮暂时隐藏

// 第二屏：以婚纱照为主角的「画面屏」。
// 刻意与第一屏彻底去重——不再复述标题 / 姓名信息栏 / 日期 / 地址（那些第一屏与地图屏已给全），
// 这里只让照片说话：一张沉浸主照（红金秀禾）+ 一行极简金署名 + 一句敬语 + 双图画廊。
export function PhotoCard() {
  const { groom, bride } = siteConfig.couple;
  const { photo } = siteConfig;
  // 真实照片缺失时回退到占位图
  const [imgSrc, setImgSrc] = useState<string>(photo.src);
  // 画廊点击放大：null = 关闭，否则为被放大图的 src
  const [zoom, setZoom] = useState<string | null>(null);
  const cardRef = useRef<HTMLElement>(null);

  return (
    <section ref={cardRef} className="relative min-h-screen w-full bg-gradient-to-b from-china-red-photo to-china-red-photo-deep flex flex-col items-center overflow-x-clip">
      {/* 背景隐约「囍」字水印，错落散布、极低透明度 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden select-none"
      >
        <span className="font-kai absolute -left-10 top-[42%] text-[16rem] leading-none text-china-gold/4">
          囍
        </span>
        <span className="font-kai absolute -right-12 top-[68%] text-[18rem] leading-none text-china-gold/4">
          囍
        </span>
      </div>

      {/* 角花装饰 */}
      <CornerOrnament className="pointer-events-none absolute top-3 left-3 w-12 h-12 text-china-gold/80 z-20" />
      <CornerOrnament className="pointer-events-none absolute top-3 right-3 w-12 h-12 text-china-gold/80 -scale-x-100 z-20" />

      {/* 沉浸主照：几乎满屏大图，底部长渐隐化入红金背景；照片上叠极简金署名。 */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1, ease: "easeOut" }}
        className="relative z-10 w-full h-[68vh] min-h-[440px] overflow-hidden"
      >
        <Image
          src={imgSrc}
          alt={`${groom.name} 与 ${bride.name} 合影`}
          fill
          priority
          sizes="100vw"
          className="object-cover object-[center_16%]"
          onError={() => setImgSrc("/photos/couple-placeholder.svg")}
          style={{
            // 模糊占位铺底：主图加载完成前先显示 24px 柔化底，避免白屏跳变
            backgroundImage: `url(${photo.blur})`,
            backgroundSize: "cover",
            backgroundPosition: "center 16%",
          }}
        />
        {/* 顶部极淡压暗，衬托角花；底部长渐隐把照片「化」进背景 */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-china-red-photo/50 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-b from-transparent via-china-red-photo/60 to-china-red-photo" />

        {/* 照片底部叠加：极简金色署名（第一屏是横排信息，这里是艺术化落款，气质不同不重复观感） */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.35 }}
          className="absolute inset-x-0 bottom-7 z-10 flex flex-col items-center text-center px-6"
        >
          <p className="font-serif text-china-gold tracking-[0.42em] text-[0.65rem] md:text-xs">
            THE ENGAGEMENT
          </p>
          <div
            className="mt-3 flex items-center gap-4 font-kai text-china-text text-3xl md:text-4xl font-semibold tracking-wide"
            style={{ textShadow: "0 2px 12px rgba(0,0,0,0.55)" }}
          >
            <span>{groom.name}</span>
            <span
              className="text-china-gold-bright text-2xl md:text-3xl"
              style={{ textShadow: "0 0 12px rgba(227,200,138,0.55)" }}
            >
              ♡
            </span>
            <span>{bride.name}</span>
          </div>
        </motion.div>
      </motion.div>

      {/* 主体：一句敬语点题（第一屏没有）+ 双图画廊。不再复述任何硬信息。 */}
      <div className="relative z-10 flex w-full flex-col items-center px-6 pb-20 pt-8">
        {/* 敬语：横线 · 敬备喜酌 · 恭候光临 · 横线 */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="flex items-center gap-4 font-kai text-china-gold-bright text-lg md:text-xl tracking-[0.15em]"
        >
          <span className="h-px w-8 bg-china-gold/50" />
          {photo.blessings.map((b, i) => (
            <span key={b} className="flex items-center gap-4">
              {i > 0 && <span className="text-china-gold/60 text-sm">·</span>}
              {b}
            </span>
          ))}
          <span className="h-px w-8 bg-china-gold/50" />
        </motion.div>

        {/* 婚纱照双图画廊：红金相框 + 轻点放大。
            两张竖版照并排，金线描边 + 内衬微光，滚动淡入错落上浮。 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="mt-10 grid w-full max-w-md grid-cols-2 gap-3.5"
        >
          {photo.gallery.map((g, i) => (
            <motion.button
              key={g.src}
              type="button"
              onClick={() => setZoom(g.large)}
              aria-label={`放大查看：${g.alt}`}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 + i * 0.12 }}
              className="group relative aspect-[3/4] overflow-hidden rounded-lg border border-china-gold/45 bg-china-red-deep/40 shadow-lg transition active:scale-[0.98]"
            >
              <Image
                src={g.src}
                alt={g.alt}
                fill
                sizes="(max-width: 768px) 45vw, 220px"
                className="object-cover transition duration-500 group-hover:scale-[1.04]"
              />
              {/* 内描金线 + 顶部微光，营造相框质感 */}
              <span className="pointer-events-none absolute inset-1 rounded-md border border-china-gold/30" />
              <span className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-black/25 to-transparent" />
              {/* 右下角放大图标 */}
              <span className="pointer-events-none absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-china-red-deep/70 text-china-gold-bright opacity-80 transition group-hover:opacity-100">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className="h-3.5 w-3.5"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3M11 8v6M8 11h6" />
                </svg>
              </span>
            </motion.button>
          ))}
        </motion.div>

        {/* 画廊下方一行极淡英文点缀（纯装饰，非信息） */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.35 }}
          className="mt-8 font-serif italic text-china-text-soft/70 text-xs md:text-sm tracking-wide"
        >
          Forever starts here
        </motion.p>
      </div>

      {/* 导出按钮（截图时自身隐藏）—— 暂时隐藏 */}
      {/* <ExportButton targetRef={cardRef} fileName="订婚请帖-合影卡" /> */}

      {/* 画廊放大浮层（lightbox）：轻点任意处关闭 */}
      <AnimatePresence>
        {zoom && (
          <motion.div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 p-3 sm:p-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setZoom(null)}
          >
            <motion.div
              className="relative max-h-[94vh] w-auto max-w-[97vw] overflow-hidden rounded-xl border border-china-gold/50 shadow-2xl"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* 竖版原比例 3:4 呈现，尽量贴满视口（高优先，避免上下留白过多） */}
              <Image
                src={zoom}
                alt="婚纱照放大"
                width={1600}
                height={2133}
                sizes="97vw"
                className="h-auto max-h-[94vh] w-auto object-contain"
              />
              {/* 金线内框 */}
              <span className="pointer-events-none absolute inset-2 rounded-lg border border-china-gold/30" />
              {/* 关闭按钮 */}
              <button
                type="button"
                onClick={() => setZoom(null)}
                aria-label="关闭"
                className="absolute top-2.5 right-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-china-red-deep/80 text-china-gold-bright shadow-lg backdrop-blur-sm transition active:scale-90"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-4 w-4"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </motion.div>
            <p className="pointer-events-none absolute bottom-6 left-0 right-0 text-center font-kai text-xs text-china-text-soft/70">
              轻触任意处关闭
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
