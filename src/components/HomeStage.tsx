"use client";

import { useState } from "react";
import { InviteCard } from "@/components/InviteCard";
// import { PhotoCard } from "@/components/PhotoCard"; // 暂时隐藏第二屏
import { OpeningCurtain } from "@/components/OpeningCurtain";
import { GoldDust } from "@/components/GoldDust";
import { FloatingPetals } from "@/components/FloatingPetals";
import { VenueMap } from "@/components/VenueMap";

// 首屏舞台编排：开场印章序幕演完后，再触发请柬入场动画。
// 金粉氛围层全程低调铺底。
export function HomeStage() {
  const [revealed, setRevealed] = useState(false);

  return (
    <>
      {/* 开场序幕（印章落印 + 金光迸发），仅播放一次 */}
      <OpeningCurtain onDone={() => setRevealed(true)} />

      {/* 持续氛围：金粉上浮 + 金箔下落，上下对流的空间层次 */}
      <GoldDust />
      <FloatingPetals />

      {/* 第一屏：纯文字红金请柬（序幕揭开后入场） */}
      <InviteCard start={revealed} />

      {/* 地图模块：两场宴会地址卡片，点击导航拉起地图 */}
      <VenueMap />

      {/* 第二屏：带新人合影的邀请函（暂时隐藏，待照片就绪后恢复） */}
      {/* <PhotoCard /> */}
    </>
  );
}
