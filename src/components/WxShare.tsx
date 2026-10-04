"use client";

import { useEffect } from "react";
import { siteConfig } from "@/config/site";
import { fetchWxSignature } from "@/lib/api";

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
 * - 向请帖后端（server/）/api/wx-signature 取签名 -> wx.config -> 设置「发送给朋友」「分享到朋友圈」卡片
 * - 仅配置微信右上角「···」菜单中的分享卡片，不额外占用页面空间
 */
export function WxShare() {
  useEffect(() => {
    if (!isWeChat()) return;

    let cancelled = false;

    (async () => {
      try {
        await loadJSSDK();
        // 待签名 URL：去掉 # 后的部分（微信要求）
        const pageUrl = location.href.split("#")[0];
        const data = await fetchWxSignature(pageUrl);
        if (cancelled || !window.wx) return;
        if ("error" in data) {
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

        // 分享卡片内容。链接用当前域名：微信要求分享链接与当前页面同属已配置的 JS 安全域名，
        // 从 invite 打开就分享 invite、从主域名打开就分享主域名
        const origin = location.origin;
        const shareData = {
          title: siteConfig.share.title,
          desc: siteConfig.share.description,
          link: `${origin}/`,
          // 缩略图：复用 OG 图，取 Next 注入的 og:image（带内容哈希），换成当前域名的绝对地址
          imgUrl: (() => {
            const og = document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content;
            const u = new URL(og ?? "/opengraph-image.jpg", origin);
            return `${origin}${u.pathname}${u.search}`;
          })(),
        };

        wx.ready(() => {
          if (cancelled) return;
          // 发送给朋友 / 分享到 QQ
          wx.updateAppMessageShareData(shareData);
          // 分享到朋友圈 / QZone（朋友圈无 desc 字段）
          wx.updateTimelineShareData({
            title: siteConfig.share.title,
            link: shareData.link,
            imgUrl: shareData.imgUrl,
          });
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

  return null;
}
