"use client";

import { useEffect, useRef, useState } from "react";
import { InviteCard } from "@/components/InviteCard";
import { PhotoCard } from "@/components/PhotoCard";
import { OpeningCurtain } from "@/components/OpeningCurtain";
import { NameFusion } from "@/components/NameFusion";
import { FestiveEasterEggs } from "@/components/FestiveEasterEggs";
import { EasterEggHint } from "@/components/EasterEggHint";
import { GoldDust } from "@/components/GoldDust";
import { FloatingPetals } from "@/components/FloatingPetals";
import { VenueMap } from "@/components/VenueMap";

// 首屏舞台编排：开场印章序幕 → 两名交融过场 → 请柬入场动画。
// 金粉氛围层全程低调铺底；喜庆互动彩蛋全程待命（长按囍/双击/摇一摇）。
//
// 名字交融的「无缝衔接」时序：
//   序幕拉开(curtainDone) → 同时挂载过场层 + 让请柬开始入场（此时全屏红幕盖住，看不见）
//   → 请柬名字行以最终布局隐形占位（nameRowHidden），供过场量取落点坐标
//   → 过场把名字飞到该落点后交棒(revealed)：名字行显形、红幕淡出，交接重合无缝。
export function HomeStage() {
  // curtainDone：开场红绒幕序幕演完（请柬随即在红幕背后开始入场）
  const [curtainDone, setCurtainDone] = useState(false);
  // revealed：名字交融过场交棒完成 → 请柬名字行显形、过场红幕淡出
  const [revealed, setRevealed] = useState(false);
  // 请柬名字行容器：供过场层读取三个落点坐标做 FLIP 衔接
  const nameRowRef = useRef<HTMLDivElement | null>(null);

  // 每次刷新都从头开始：关闭浏览器的滚动位置记忆，并强制回到顶部。
  // 否则刷新时浏览器会自动恢复到上次的滚动位置（可能停在页面底部）。
  useEffect(() => {
    const prev = history.scrollRestoration;
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
    return () => {
      if ("scrollRestoration" in history) history.scrollRestoration = prev;
    };
  }, []);

  // 序幕未揭开（帷幕还没完全拉开）时锁定页面滚动，避免用户提前下滑；
  // 揭开后恢复。reduced-motion 下序幕被跳过，revealed 立即为 true，不会误锁。
  useEffect(() => {
    if (revealed) return; // 已揭开：保持可滚动
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, [revealed]);

  return (
    <>
      {/* 开场序幕（印章落印 + 金光迸发），仅播放一次 */}
      <OpeningCurtain onDone={() => setCurtainDone(true)} />

      {/* 名字交融过场：序幕拉开后、请柬入场前的仪式高潮（仅序幕演完才挂载）。
          读取请柬名字行落点做 FLIP 衔接，到位后 onDone 交棒。 */}
      {curtainDone && !revealed && (
        <NameFusion nameRowRef={nameRowRef} onDone={() => setRevealed(true)} />
      )}

      {/* 持续氛围：金粉上浮 + 金箔下落，上下对流的空间层次 */}
      <GoldDust />
      <FloatingPetals />

      {/* 喜庆互动彩蛋：长按囍字撒金粉雨 / 双击放灯笼 / 摇一摇落花瓣 */}
      <FestiveEasterEggs />
      {/* 彩蛋极淡提示：请柬入场后短暂浮现一行引导 */}
      <EasterEggHint start={revealed} />

      {/* 第一屏：纯文字红金请柬。
          序幕一拉开就在红幕背后开始入场；名字行先隐形占位供过场量坐标，交棒后显形。 */}
      <InviteCard
        start={curtainDone}
        nameRowRef={nameRowRef}
        nameRowHidden={!revealed}
      />

      {/* 第二屏：带新人合影的邀请函（红金秀禾服主照 + 双图画廊，承接请柬情绪高潮） */}
      <PhotoCard />

      {/* 地图模块：两场宴会地址卡片，点击导航拉起地图 */}
      <VenueMap />
    </>
  );
}
