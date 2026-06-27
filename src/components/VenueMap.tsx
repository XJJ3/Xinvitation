"use client";

import { motion } from "framer-motion";
import { siteConfig } from "@/config/site";
import { openMap } from "@/lib/openMap";
import { CornerOrnament } from "./Ornaments";

// 地图卡片模块：每场宴席一张卡片，含酒店名、地址、地图缩略图、「导航」按钮。
// 点击导航：微信内拉起微信内置地图，非微信跳腾讯地图。
export function VenueMap() {
  const { banquets } = siteConfig.event;

  return (
    <section className="relative w-full bg-gradient-to-b from-china-red-deep to-china-red px-6 py-16 flex flex-col items-center gap-8 overflow-x-clip">
      {/* 模块标题 */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="text-center"
      >
        <p className="font-serif text-china-gold tracking-[0.3em] text-xs">VENUE</p>
        <h2 className="font-kai text-china-text text-2xl md:text-3xl font-semibold tracking-wide mt-2">
          宴会地址
        </h2>
        <p className="font-kai text-china-text-soft text-sm mt-2">
          点击「导航」即可拉起地图前往
        </p>
      </motion.div>

      {/* 两场地图卡片 */}
      {banquets.map((b, idx) => (
        <motion.div
          key={b.label}
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: idx * 0.12 }}
          className="relative w-full max-w-sm rounded-xl border border-china-gold/40 bg-china-red-deep/50 p-5 shadow-lg backdrop-blur-sm"
        >
          {/* 卡片角花 */}
          <CornerOrnament className="pointer-events-none absolute top-1.5 left-1.5 w-7 h-7 text-china-gold/70" />
          <CornerOrnament className="pointer-events-none absolute top-1.5 right-1.5 w-7 h-7 text-china-gold/70 -scale-x-100" />

          {/* 场次 + 时间 */}
          <div className="flex items-baseline justify-between">
            <span className="font-kai text-china-gold-bright text-lg tracking-wide">
              {b.label}
            </span>
            <span className="font-serif text-china-text-soft text-sm tracking-widest">
              {b.time}
            </span>
          </div>

          {/* 酒店名 */}
          <p className="font-kai text-china-text text-xl font-semibold mt-2">
            {b.mapName}
          </p>
          {/* 详细地址 */}
          <p className="font-kai text-china-text-soft text-sm mt-1 leading-relaxed">
            {b.venue}
          </p>

          {/* 地图缩略图（占位：优雅网格 + 坐标点；有静态图 API key 后可替换为真实地图） */}
          <button
            type="button"
            onClick={() =>
              openMap({ lat: b.lat, lng: b.lng, name: b.mapName, address: b.venue })
            }
            aria-label={`导航到${b.mapName}`}
            className="group relative mt-4 block h-36 w-full overflow-hidden rounded-lg border border-china-gold/30"
          >
            {/* 仿地图底纹：暖色网格 + 道路线 */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(135deg, #2a1410 0%, #3a1c16 100%)",
                backgroundImage:
                  "linear-gradient(rgba(201,168,106,0.12) 1px, transparent 1px), " +
                  "linear-gradient(90deg, rgba(201,168,106,0.12) 1px, transparent 1px)",
                backgroundSize: "28px 28px, 28px 28px",
              }}
            />
            {/* 一条斜向「主干道」 */}
            <div className="absolute left-[-10%] top-1/2 h-2 w-[120%] -rotate-12 bg-china-gold/20" />
            {/* 中心坐标点（脉冲光圈 + 红点） */}
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <motion.span
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-china-gold-bright"
                style={{ width: 18, height: 18 }}
                animate={{ opacity: [0.6, 0], scale: [0.6, 2.4] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
              />
              <span className="relative block h-3 w-3 rounded-full bg-china-red-bright ring-2 ring-china-gold-bright" />
            </span>
            {/* 底部「点击导航」条 */}
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-china-red-deep/80 py-2 font-kai text-sm text-china-gold-bright transition group-active:bg-china-red-deep">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="h-4 w-4"
              >
                <path d="M12 21s-7-6.5-7-11a7 7 0 1 1 14 0c0 4.5-7 11-7 11Z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
              点击导航前往
            </span>
          </button>
        </motion.div>
      ))}
    </section>
  );
}
