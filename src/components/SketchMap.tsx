"use client";

import { motion } from "framer-motion";

// 示意插画风地图（SVG 手绘）：红金底 + 金线主干道 + 水域色块 + 金色酒店标点。
// 不追求与真实地图严格一致，追求「一眼能看出大致路网格局 + 贴合红金请柬风格 + 好看」。
// 每张图用一份 SketchMapData 描述自己的道路/水域/标点几何，组件统一渲染。
// viewBox 统一 0 0 300 180（与卡片 h-36 比例接近），坐标都在此空间内。

export type SketchRoad = {
  d: string; // path 数据
  width?: number; // 线宽（主干道粗、支路细）
  major?: boolean; // 是否主干道（更亮的金 + 描边）
};

// 路名标注：在指定位置写一段路名文字，可旋转以贴合道路走向。
export type SketchLabel = {
  text: string; // 路名，如「兴华路」
  x: number;
  y: number;
  rotate?: number; // 文字旋转角度（顺时针为正），贴合道路方向
  size?: number; // 字号（viewBox 单位），默认 9
};

// 建筑块：一片楼宇轮廓 + 可选楼名。highlight 为目标楼（如东辰大厦），用更亮的金边突出。
export type SketchBuilding = {
  d: string; // 多边形 path
  name?: string; // 楼名标注
  nameX?: number; // 楼名位置（默认取多边形附近，需手动给更准）
  nameY?: number;
  nameSize?: number;
  highlight?: boolean; // 是否目标楼（更亮金边 + 暖色填充）
};

export type SketchMapData = {
  // 水域多边形（江/河/池塘），可多块
  waters?: string[];
  // 绿地多边形（公园/绿化带），可多块
  greens?: string[];
  // 建筑块（楼宇），可带楼名
  buildings?: SketchBuilding[];
  // 道路集合
  roads: SketchRoad[];
  // 路名标注集合
  labels?: SketchLabel[];
  // 酒店标点位置（viewBox 坐标）
  marker: { x: number; y: number };
  // 酒店名（标在 pin 旁，让人一眼认出目标）
  markerLabel?: string;
};

export function SketchMap({
  data,
  label,
}: {
  data: SketchMapData;
  label: string;
}) {
  return (
    <svg
      viewBox="0 0 300 180"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full"
      aria-label={`${label}位置示意地图`}
    >
      {/* 底色：深红渐变 */}
      <defs>
        <linearGradient id="sketch-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7a0f13" />
          <stop offset="55%" stopColor="#640c10" />
          <stop offset="100%" stopColor="#560b0c" />
        </linearGradient>
        {/* 主干道金色描边渐变 */}
        <linearGradient id="sketch-road" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#c9a86a" />
          <stop offset="50%" stopColor="#e3c88a" />
          <stop offset="100%" stopColor="#c9a86a" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="300" height="180" fill="url(#sketch-bg)" />

      {/* 绿地：暗金绿色块，低透明度铺底 */}
      {data.greens?.map((d, i) => (
        <path key={`g-${i}`} d={d} fill="rgba(120,140,90,0.16)" />
      ))}

      {/* 水域：暗青蓝色块 + 极淡描边 */}
      {data.waters?.map((d, i) => (
        <path
          key={`w-${i}`}
          d={d}
          fill="rgba(70,110,130,0.30)"
          stroke="rgba(120,170,190,0.25)"
          strokeWidth={0.8}
        />
      ))}

      {/* 建筑块：楼宇轮廓。highlight 目标楼用更亮金边 + 暖填充突出 */}
      {data.buildings?.map((b, i) => (
        <path
          key={`b-${i}`}
          d={b.d}
          fill={b.highlight ? "rgba(201,168,106,0.22)" : "rgba(245,236,224,0.07)"}
          stroke={b.highlight ? "#e3c88a" : "rgba(201,168,106,0.30)"}
          strokeWidth={b.highlight ? 1.3 : 0.7}
        />
      ))}

      {/* 道路：先描一层暗底加厚（路基），再叠金线 */}
      {data.roads.map((r, i) => (
        <path
          key={`rb-${i}`}
          d={r.d}
          fill="none"
          stroke="rgba(0,0,0,0.25)"
          strokeWidth={(r.width ?? 3) + 1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {data.roads.map((r, i) => (
        <path
          key={`r-${i}`}
          d={r.d}
          fill="none"
          stroke={r.major ? "url(#sketch-road)" : "rgba(201,168,106,0.45)"}
          strokeWidth={r.width ?? 3}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={r.major ? 0.95 : 0.7}
        />
      ))}

      {/* 路名标注：米白文字 + 深色描边，沿道路方向旋转，确保在任何底色上都清晰 */}
      {data.labels?.map((l, i) => (
        <text
          key={`l-${i}`}
          x={l.x}
          y={l.y}
          transform={l.rotate ? `rotate(${l.rotate} ${l.x} ${l.y})` : undefined}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={l.size ?? 9}
          fontWeight={600}
          fill="#f5ece0"
          stroke="rgba(60,8,9,0.9)"
          strokeWidth={2.4}
          paintOrder="stroke"
          style={{ fontFamily: "var(--font-kai), 'Kaiti SC', 'STKaiti', serif" }}
        >
          {l.text}
        </text>
      ))}

      {/* 建筑名标注：比路名稍小、不旋转；目标楼用金色，其余米白 */}
      {data.buildings?.map((b, i) =>
        b.name && b.nameX != null && b.nameY != null ? (
          <text
            key={`bn-${i}`}
            x={b.nameX}
            y={b.nameY}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={b.nameSize ?? 7.5}
            fontWeight={700}
            fill={b.highlight ? "#e3c88a" : "#f5ece0"}
            stroke="rgba(60,8,9,0.9)"
            strokeWidth={2}
            paintOrder="stroke"
            style={{ fontFamily: "var(--font-kai), 'Kaiti SC', 'STKaiti', serif" }}
          >
            {b.name}
          </text>
        ) : null
      )}

      {/* 酒店标点：金色水滴 pin + 脉冲光圈 + 名牌 */}
      <g transform={`translate(${data.marker.x}, ${data.marker.y})`}>
        {/* 脉冲光圈 */}
        <motion.circle
          cx={0}
          cy={0}
          r={6}
          fill="none"
          stroke="#e3c88a"
          strokeWidth={1.2}
          initial={{ opacity: 0.6, scale: 0.6 }}
          animate={{ opacity: [0.6, 0], scale: [0.6, 2.6] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
          style={{ transformOrigin: "center" }}
        />
        {/* 水滴 pin（金描边红身） */}
        <path
          d="M0 -11 C 5.5 -11, 8 -6.5, 8 -3 C 8 2.5, 0 9, 0 9 C 0 9, -8 2.5, -8 -3 C -8 -6.5, -5.5 -11, 0 -11 Z"
          fill="#c1272d"
          stroke="#e3c88a"
          strokeWidth={1.4}
        />
        <circle cx={0} cy={-3} r={2.6} fill="#e3c88a" />

        {/* 酒店名牌：金底深字小标签，紧贴 pin 下方，让人一眼认出目标 */}
        {data.markerLabel && (
          <g transform="translate(0, 13)">
            <rect
              x={-data.markerLabel.length * 5.2 - 4}
              y={-7}
              width={data.markerLabel.length * 10.4 + 8}
              height={14}
              rx={3}
              fill="rgba(122,15,19,0.92)"
              stroke="#c9a86a"
              strokeWidth={0.8}
            />
            <text
              x={0}
              y={0}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={9}
              fontWeight={700}
              fill="#e3c88a"
              style={{ fontFamily: "var(--font-kai), 'Kaiti SC', 'STKaiti', serif" }}
            >
              {data.markerLabel}
            </text>
          </g>
        )}
      </g>
    </svg>
  );
}
