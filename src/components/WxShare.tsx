"use client";

import { useEffect, useState } from "react";
import { siteConfig } from "@/config/site";

// 微信 JS-SDK 类型（最小声明，避免引入额外依赖）
declare global {
  interface Window {
    // JS-SDK config 是否已就绪（wx.ready 成功后置 true，error 置 false）
    __wxReady?: boolean;
    wx?: {
      config: (cfg: Record<string, unknown>) => void;
      ready: (cb: () => void) => void;
      error: (cb: (err: unknown) => void) => void;
      updateAppMessageShareData: (cfg: Record<string, unknown>) => void;
      updateTimelineShareData: (cfg: Record<string, unknown>) => void;
      openLocation: (cfg: {
        latitude: number;
        longitude: number;
        name?: string;
        address?: string;
        scale?: number;
        fail?: (err: unknown) => void;
        complete?: (res: unknown) => void;
      }) => void;
    };
  }
}

// 是否在微信内置浏览器中
function isWeChat() {
  if (typeof navigator === "undefined") return false;
  return /micromessenger/i.test(navigator.userAgent);
}

// 动态加载本地 jweixin SDK
function loadJSSDK(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.wx) return resolve();
    const s = document.createElement("script");
    s.src = "/jweixin-1.6.0.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("jweixin 加载失败"));
    document.head.appendChild(s);
  });
}

/**
 * 微信分享配置组件：
 * - 仅在微信内置浏览器生效（其它环境直接什么都不做）
 * - 向后端 /api/wx-signature 取签名 -> wx.config -> 设置「发送给朋友」「分享到朋友圈」卡片
 * - 同时渲染一个「分享给好友」提示按钮，引导用户用右上角「···」分享
 */
export function WxShare() {
  const [ready, setReady] = useState(false); // 微信 config 成功
  const [showTip, setShowTip] = useState(false); // 点击按钮后的引导浮层

  useEffect(() => {
    if (!isWeChat()) return;

    let cancelled = false;

    (async () => {
      try {
        await loadJSSDK();
        // 待签名 URL：去掉 # 后的部分（微信要求）
        const pageUrl = location.href.split("#")[0];
        const res = await fetch(
          `/api/wx-signature?url=${encodeURIComponent(pageUrl)}`
        );
        const data = await res.json();
        if (cancelled || !window.wx) return;
        if (data.error) {
          console.error("微信签名失败：", data.error);
          return;
        }

        const wx = window.wx;
        wx.config({
          debug: false,
          appId: data.appId,
          timestamp: data.timestamp,
          nonceStr: data.nonceStr,
          signature: data.signature,
          jsApiList: [
            "updateAppMessageShareData",
            "updateTimelineShareData",
            "openLocation",
          ],
        });

        // 分享卡片内容
        const shareData = {
          title: siteConfig.share.title,
          desc: siteConfig.share.description,
          link: siteConfig.url,
          // 缩略图：复用构建时生成的红金 OG 图（绝对地址）
          imgUrl: `${siteConfig.url}/opengraph-image`,
        };

        wx.ready(() => {
          if (cancelled) return;
          // 发送给朋友 / 分享到 QQ
          wx.updateAppMessageShareData(shareData);
          // 分享到朋友圈 / QZone（朋友圈无 desc 字段）
          wx.updateTimelineShareData({
            title: siteConfig.share.title,
            link: siteConfig.url,
            imgUrl: shareData.imgUrl,
          });
          setReady(true);
          // 全局标记：JS-SDK 已就绪，openLocation 等接口此后可安全调用
          window.__wxReady = true;
        });

        wx.error((err) => {
          console.error("wx.config 失败：", err);
          window.__wxReady = false;
        });
      } catch (err) {
        console.error("微信分享初始化失败：", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // 非微信环境不渲染按钮
  if (!isWeChat()) return null;

  return (
    <>
      {/* 「分享给好友」提示按钮：固定右下角，仅微信内显示。
          常态轻微呼吸（CSS 动画），点击回弹，hover/active 金光增强。 */}
      <button
        type="button"
        onClick={() => setShowTip(true)}
        aria-label="分享给好友"
        className="share-breathe fixed bottom-5 left-5 z-[60] flex items-center gap-2 rounded-full border border-china-gold/70 bg-china-red-deep/80 px-4 py-2.5 font-kai text-sm text-china-gold-bright shadow-lg backdrop-blur-sm transition hover:border-china-gold-bright hover:shadow-[0_0_16px_rgba(227,200,138,0.5)] active:scale-95"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="h-4 w-4"
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
        </svg>
        分享给好友
      </button>

      {/* 引导浮层：提示点右上角「···」 */}
      {showTip && (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-end bg-black/60 p-4"
          onClick={() => setShowTip(false)}
        >
          <div className="mt-2 mr-2 max-w-[16rem] rounded-xl bg-china-red-deep/95 p-5 text-china-text-soft shadow-2xl">
            <p className="font-kai text-base leading-relaxed">
              点击右上角的 <span className="text-china-gold-bright">···</span>
              <br />
              选择「发送给朋友」或「分享到朋友圈」
              <br />
              即可分享这张精美请帖 🎉
            </p>
            <div className="mt-3 text-right text-xs text-china-gold/70">
              {ready ? "（轻触任意处关闭）" : "（分享卡片加载中…轻触关闭）"}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
