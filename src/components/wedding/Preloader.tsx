"use client";

import { useEffect, useState } from "react";
import { siteConfig } from "@/config/site";

const { couple } = siteConfig;

const PETALS = [
  { left: "7%", delay: "0s", dur: "9s", size: 7 },
  { left: "20%", delay: "-3.2s", dur: "11s", size: 5 },
  { left: "36%", delay: "-6s", dur: "8.5s", size: 6 },
  { left: "55%", delay: "-1.8s", dur: "10s", size: 5 },
  { left: "72%", delay: "-5s", dur: "9s", size: 7 },
  { left: "88%", delay: "-8s", dur: "11.5s", size: 6 },
];

/**
 * 前置加载页：粉色高级婚礼主题，双环旋转 + 囍字呼吸 + 新人姓名浮现 + 进度条。
 * 最少展示 3.6s、最多 7s（结合 window load），期间给 .inv 加 inert 暂停自动下滑，
 * 结束后淡出并把主内容交还给宾客。
 */
export default function Preloader() {
  const [done, setDone] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const page = document.querySelector<HTMLElement>(".inv");
    if (page) page.inert = true;

    const MIN_MS = 3600;
    const MAX_MS = 7000;
    const start = Date.now();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      const elapsed = Date.now() - start;
      const wait = Math.min(MAX_MS, Math.max(MIN_MS, elapsed));
      window.setTimeout(() => {
        setDone(true);
        if (page) page.inert = false;
        window.setTimeout(() => setGone(true), 750);
      }, Math.max(0, wait - elapsed));
    };

    if (document.readyState === "complete") finish();
    else window.addEventListener("load", finish, { once: true });
    const safety = window.setTimeout(finish, MAX_MS + 500);

    return () => {
      window.clearTimeout(safety);
      if (page) page.inert = false;
    };
  }, []);

  if (gone) return null;

  return (
    <div className={`inv-preloader ${done ? "inv-preloader-done" : ""}`} aria-hidden="true">
      <div className="inv-preloader-petals">
        {PETALS.map((p, i) => (
          <i
            key={i}
            style={{
              left: p.left,
              width: p.size,
              height: p.size * 1.5,
              animationDelay: p.delay,
              animationDuration: p.dur,
            }}
          />
        ))}
      </div>

      <div className="inv-preloader-orbit">
        <div className="inv-preloader-mark">囍</div>
      </div>

      <div className="inv-preloader-names">
        {couple.groom.name} <b>♡</b> {couple.bride.name}
      </div>
      <div className="inv-preloader-sub">我们结婚啦</div>
      <div className="inv-preloader-date">{siteConfig.wedding.cover.dateEn}</div>

      <div className="inv-preloader-bar">
        <i />
      </div>
      <div className="inv-preloader-hint">正在为您点亮这份幸福…</div>
    </div>
  );
}
