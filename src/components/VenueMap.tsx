"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { siteConfig } from "@/config/site";
import {
  jumpToMap,
  isWeChat,
  MAP_PROVIDERS,
  type MapPoint,
} from "@/lib/openMap";
import { CornerOrnament } from "./Ornaments";
import { SketchMap, type SketchMapData } from "./SketchMap";

// 两场宴席的极简「路口示意」地图（viewBox 0 0 300 180）。
// 不还原真实路网细节，只画清楚【酒店所在的那两条马路如何交汇】——两个酒店都在路口上。
// 每张图：两条命名主干道 + 交汇处 + 酒店 pin。按场次 label 取用。
const SKETCH_MAPS: Record<string, SketchMapData> = {
  // 辰阳大酒店：对照 PNG 细描——左上水域、「院店路」自顶斜插汇入「兴华路」大路口，
  // 路口右侧为「东辰大厦」整片建筑，辰阳大酒店就在东辰大厦内（pin 落在楼上）。
  辰阳大酒店: {
    waters: ["M -5 -5 L 58 -5 L 50 40 L 22 70 L -5 58 Z"],
    greens: [
      "M -5 62 L 36 74 L 22 110 L -5 100 Z", // 水域下方绿地
      "M 196 150 L 305 138 L 305 185 L 205 185 Z", // 右下兴华路旁绿带
    ],
    buildings: [
      // 东辰大厦：路口右侧一大片建筑，辰阳大酒店所在（目标楼，高亮）
      {
        d: "M 150 56 L 280 50 L 286 122 L 156 128 Z",
        name: "东辰大厦",
        nameX: 218,
        nameY: 104,
        nameSize: 8,
        highlight: true,
      },
    ],
    roads: [
      // 院店路：自顶部中偏左斜下汇入路口
      { d: "M 150 -5 C 146 36, 134 66, 110 92", width: 9, major: true },
      // 兴华路：横贯下半部，右侧水平延伸
      { d: "M -5 122 C 80 112, 190 122, 305 120", width: 12, major: true },
      // 兴华路辅路：左下一条
      { d: "M -5 152 C 70 148, 150 152, 200 150", width: 6 },
      // 路口向右下的分叉支路
      { d: "M 110 92 C 150 100, 220 116, 305 150", width: 6 },
      // 路口向左下的支路
      { d: "M 110 92 C 84 110, 60 134, 38 168", width: 5 },
    ],
    labels: [
      { text: "院店路", x: 116, y: 46, rotate: 58 },
      { text: "兴华路", x: 240, y: 120, rotate: -2 },
      { text: "兴华路辅路", x: 70, y: 152, size: 7 },
    ],
    marker: { x: 205, y: 74 },
    markerLabel: "辰阳大酒店",
  },
  // 裕锦大酒店：团结路 × 临城南路 的交汇处。
  // 团结路纵向、临城南路横向，十字交汇，酒店在路口右上角的楼里。
  裕锦大酒店: {
    buildings: [
      // 裕锦大酒店所在楼：路口右上角（高亮）
      {
        d: "M 168 50 L 232 46 L 236 96 L 172 100 Z",
        name: "裕锦大酒店",
        nameX: 202,
        nameY: 73,
        nameSize: 7.5,
        highlight: true,
      },
    ],
    roads: [
      // 临城南路：横贯下方主干
      { d: "M -5 110 C 90 108, 200 112, 305 110", width: 13, major: true },
      // 团结路：纵向主干，在路口与临城南路交汇
      { d: "M 150 -5 C 148 60, 150 120, 150 185", width: 12, major: true },
    ],
    labels: [
      { text: "临城南路", x: 80, y: 102, rotate: 0, size: 8.5 },
      { text: "团结路", x: 162, y: 40, rotate: 90 },
    ],
    marker: { x: 200, y: 70 },
  },
};

// 地图卡片模块：每场宴席一张卡片，含酒店名、地址、地图缩略图、「导航」按钮。
// 点击导航 → 弹出地图选择菜单（高德 / 百度 / 腾讯 / 复制地址），用户自选地图 App。
export function VenueMap() {
  const { banquets } = siteConfig.event;
  // 当前选中的导航目标（null = 菜单关闭）
  const [active, setActive] = useState<MapPoint | null>(null);
  const [copied, setCopied] = useState(false);
  // 点击地图后的临时提示文案（唤起 App / 微信引导 / 未唤起），null = 不显示
  const [hint, setHint] = useState<string | null>(null);

  const copyAddress = async () => {
    if (!active) return;
    try {
      await navigator.clipboard.writeText(`${active.name} ${active.address}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  // 点击某个地图：根据 jumpToMap 返回值给出对应提示，当前页不跳走。
  const handlePick = (key: Parameters<typeof jumpToMap>[0]) => {
    if (!active) return;
    setHint(null);
    const result = jumpToMap(key, active, () => {
      // 真实检测：2 秒后页面仍在前台 → 判定未安装该 App，此时才提示
      setHint("未检测到该地图 App，可换一个地图，或点「复制地址」后手动搜索");
    });
    if (result === "wechat") {
      // 微信内无法唤起第三方 App，引导用浏览器打开
      setHint("微信内无法直接打开地图 App，请点右上角「···」→「在浏览器打开」后再试，或先「复制地址」");
    } else if (result === "web-opened") {
      // 桌面端：已用新标签打开网页版，直接收起菜单
      setActive(null);
    }
    // app-attempted：已尝试唤起，成功则切到 App（无提示）；失败由上面回调提示
  };

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
          点击「导航」即可选择地图前往
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

          {/* 地图缩略图：示意插画风 SVG 手绘地图（红金骨架 + 酒店标点） */}
          <MapThumb
            sketch={SKETCH_MAPS[b.mapName]}
            name={b.mapName}
            onPick={() => {
              setActive({ lat: b.lat, lng: b.lng, name: b.mapName, address: b.venue });
              setHint(null);
            }}
          />
        </motion.div>
      ))}

      {/* 地图选择菜单（底部弹层） */}
      <AnimatePresence>
        {active && (
          <motion.div
            className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setActive(null);
              setHint(null);
            }}
          >
            <motion.div
              className="w-full max-w-md rounded-t-2xl border-t border-china-gold/40 bg-china-red-deep p-5 pb-8"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-center font-kai text-china-gold-bright text-base">
                导航到 {active.name}
              </p>
              <p className="mt-1 text-center font-kai text-china-text-soft text-xs leading-relaxed">
                {active.address}
              </p>

              {/* 微信内提示：建议用浏览器打开（仅微信内显示，常驻提醒） */}
              {isWeChat() && (
                <p className="mt-3 rounded-lg bg-china-gold/10 px-3 py-2 text-center font-kai text-[11px] leading-relaxed text-china-gold-bright">
                  微信内无法直接唤起地图 App，请点右上角「···」→「在浏览器打开」后再导航
                </p>
              )}

              {/* 地图选项 */}
              <div className="mt-5 space-y-2.5">
                {MAP_PROVIDERS.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => handlePick(m.key)}
                    className="block w-full rounded-lg border border-china-gold/40 bg-china-red/40 py-3 font-kai text-china-text text-base transition active:scale-[0.98] active:bg-china-red/70"
                  >
                    {m.label}
                  </button>
                ))}
                {/* 复制地址 */}
                <button
                  type="button"
                  onClick={copyAddress}
                  className="block w-full rounded-lg border border-china-gold/20 py-3 font-kai text-china-text-soft text-sm transition active:scale-[0.98]"
                >
                  {copied ? "已复制地址 ✓" : "复制地址"}
                </button>
              </div>

              {/* 点击地图后的临时提示（唤起 App / 未安装等） */}
              {hint && (
                <p className="mt-4 rounded-lg border border-china-gold/20 bg-china-red/30 px-3 py-2.5 text-center font-kai text-xs leading-relaxed text-china-text-soft">
                  {hint}
                </p>
              )}

              {/* 取消 */}
              <button
                type="button"
                onClick={() => {
                  setActive(null);
                  setHint(null);
                }}
                className="mt-4 block w-full py-2 font-kai text-china-gold/70 text-sm"
              >
                取消
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

// 地图缩略图：示意插画风 SVG 手绘地图（红金骨架 + 金线主干道 + 水域 + 酒店标点）。
// 不依赖任何图片/外部地图服务；酒店名牌叠在右上，底部为「点击导航」条。
function MapThumb({
  sketch,
  name,
  onPick,
}: {
  sketch?: SketchMapData;
  name: string;
  onPick: () => void;
}) {
  return (
    <div className="mt-4">
      {/* 地图块：纯展示（点击也可导航），底部不再叠导航条 */}
      <button
        type="button"
        onClick={onPick}
        aria-label={`查看${name}地图`}
        className="group relative block h-36 w-full overflow-hidden rounded-lg border border-china-gold/30"
      >
        {sketch ? (
          <SketchMap data={sketch} label={name} />
        ) : (
          // 无骨架数据时的回退底纹：暖色网格 + 一条斜向主干道
          <>
            <div
              className="absolute inset-0"
              style={{
                background: "linear-gradient(135deg, #2a1410 0%, #3a1c16 100%)",
                backgroundImage:
                  "linear-gradient(rgba(201,168,106,0.12) 1px, transparent 1px), " +
                  "linear-gradient(90deg, rgba(201,168,106,0.12) 1px, transparent 1px)",
                backgroundSize: "28px 28px, 28px 28px",
              }}
            />
            <div className="absolute left-[-10%] top-1/2 h-2 w-[120%] -rotate-12 bg-china-gold/20" />
          </>
        )}
      </button>

      {/* 「点击导航前往」独立按钮：移到地图下方，不再压住地图 */}
      <button
        type="button"
        onClick={onPick}
        aria-label={`导航到${name}`}
        className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-china-gold/40 bg-china-red-deep/60 py-2.5 font-kai text-sm text-china-gold-bright transition active:scale-[0.98] active:bg-china-red-deep"
      >
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
      </button>
    </div>
  );
}
