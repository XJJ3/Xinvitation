"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { siteConfig } from "@/config/site";

// 背景音乐：右上角金色唱片图标，播放时旋转、暂停时静止，点击切换。
// 播放策略：加载即尝试自动播；多数手机浏览器（iOS Safari / 微信）禁止带声音自动播，
// 此时挂一次性的全局交互监听，用户首次点击/触摸页面时补播——几乎无感。
// 循环播放；尊重 prefers-reduced-motion（仅影响唱片旋转动画，不影响声音）。
export function BgMusic() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // 默认音量 50%，作为背景音不至于太吵
    audio.volume = 0.5;

    let done = false; // 是否已成功播放（成功后不再监听交互）

    const removeInteractListeners = () => {
      // 捕获阶段监听，确保即便开场序幕等全屏层在上面也能先收到
      document.removeEventListener("pointerdown", onInteract, true);
      document.removeEventListener("touchstart", onInteract, true);
      document.removeEventListener("click", onInteract, true);
      document.removeEventListener("keydown", onInteract, true);
      window.removeEventListener("scroll", onInteract, true);
    };

    // 任意交互都尝试播放；一旦成功就标记 done 并撤掉监听
    function onInteract() {
      if (done) return;
      audio!
        .play()
        .then(() => {
          done = true;
          setPlaying(true);
          removeInteractListeners();
        })
        .catch(() => {
          /* 仍被拦截则保留监听，等下次交互再试 */
        });
    }

    // 先同步挂上交互监听（不放进异步回调里，避免错过用户的第一次点击）
    document.addEventListener("pointerdown", onInteract, true);
    document.addEventListener("touchstart", onInteract, true);
    document.addEventListener("click", onInteract, true);
    document.addEventListener("keydown", onInteract, true);
    window.addEventListener("scroll", onInteract, true);

    // 再尝试一次「无交互自动播」（支持的浏览器会直接响）
    audio
      .play()
      .then(() => {
        done = true;
        setPlaying(true);
        removeInteractListeners();
      })
      .catch(() => {
        /* 被拦截：等用户交互时由 onInteract 补播 */
      });

    // 微信内置浏览器专属：借 WeixinJSBridge 在无需用户交互时触发一次允许播放的上下文。
    // 这是请帖类页面在微信里「一进页就自动播」的通用技巧；只在微信里有这个全局对象，
    // 普通浏览器无此对象、走上面的交互补播。失败也无妨，仍有交互兜底。
    const playViaWeixin = () => {
      type WxBridge = {
        invoke: (api: string, params: object, cb: () => void) => void;
      };
      const bridge = (window as unknown as { WeixinJSBridge?: WxBridge })
        .WeixinJSBridge;
      if (!bridge) return;
      bridge.invoke("getNetworkType", {}, () => {
        if (done) return;
        audio
          .play()
          .then(() => {
            done = true;
            setPlaying(true);
            removeInteractListeners();
          })
          .catch(() => {});
      });
    };
    // 桥可能已就绪（直接调），也可能稍后才就绪（等事件）
    playViaWeixin();
    document.addEventListener("WeixinJSBridgeReady", playViaWeixin, false);

    // 同步真实播放状态（被系统/其它媒体打断时图标也要停转）
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    return () => {
      done = true;
      removeInteractListeners();
      document.removeEventListener("WeixinJSBridgeReady", playViaWeixin, false);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  };

  return (
    <>
      <audio
        ref={audioRef}
        src={siteConfig.music.src}
        loop
        preload="auto"
        playsInline
      />

      {/* 右上角金色唱片开关：播放时缓慢旋转 */}
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "暂停背景音乐" : "播放背景音乐"}
        title={`${siteConfig.music.title} · ${siteConfig.music.artist}`}
        className="fixed right-4 top-4 z-[90] flex h-10 w-10 items-center justify-center rounded-full border border-china-gold/50 bg-china-red-deep/70 backdrop-blur-sm transition active:scale-95"
      >
        <motion.span
          className="block h-7 w-7"
          animate={{ rotate: playing ? 360 : 0 }}
          transition={
            playing
              ? { duration: 6, repeat: Infinity, ease: "linear" }
              : { duration: 0.4, ease: "easeOut" }
          }
        >
          {/* 唱片图标：金色同心圆 + 中心孔 */}
          <svg viewBox="0 0 32 32" className="h-full w-full">
            <circle cx="16" cy="16" r="14" fill="#560b0c" stroke="#c9a86a" strokeWidth="1.4" />
            <circle cx="16" cy="16" r="10" fill="none" stroke="rgba(201,168,106,0.4)" strokeWidth="0.8" />
            <circle cx="16" cy="16" r="6.5" fill="none" stroke="rgba(201,168,106,0.4)" strokeWidth="0.8" />
            <circle cx="16" cy="16" r="3.4" fill="#c1272d" stroke="#e3c88a" strokeWidth="1" />
            <circle cx="16" cy="16" r="1" fill="#e3c88a" />
            {/* 高光弧，让唱片有质感 */}
            <path d="M 8 9 A 11 11 0 0 1 23 8" fill="none" stroke="rgba(227,200,138,0.55)" strokeWidth="1" strokeLinecap="round" />
          </svg>
        </motion.span>
      </button>
    </>
  );
}
