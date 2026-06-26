"use client";

import { useState, type RefObject } from "react";
import { domToPng } from "modern-screenshot";

// 导出按钮：把传入的目标节点渲染成高清 PNG 下载。
// - targetRef：要导出的那一屏的容器节点
// - fileName：下载文件名（不含扩展名）
// - 截图期间给目标节点加 data-exporting 属性，配合 CSS 隐藏带 data-export-hide 的元素（如按钮、下滑提示）
export function ExportButton({
  targetRef,
  fileName,
}: {
  targetRef: RefObject<HTMLElement | null>;
  fileName: string;
}) {
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    const node = targetRef.current;
    if (!node || busy) return;

    setBusy(true);
    // 标记进入导出态，让 data-export-hide 的元素在截图里消失
    node.setAttribute("data-exporting", "true");
    try {
      const dataUrl = await domToPng(node, {
        // 3 倍像素密度，导出非常高清的图片
        scale: 3,
        // 等字体加载完再截，避免楷体回退成系统默认字体
        font: {},
        // 背景渐变在 section 自身上，节点尺寸即整屏
        backgroundColor: undefined,
      });

      const link = document.createElement("a");
      link.download = `${fileName}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("导出图片失败：", err);
      alert("导出失败，请重试");
    } finally {
      node.removeAttribute("data-exporting");
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={busy}
      data-export-hide
      aria-label="导出为图片"
      className="absolute bottom-5 right-5 z-50 flex items-center gap-2 rounded-full border border-china-gold/70 bg-china-red-deep/80 px-4 py-2.5 font-kai text-sm text-china-gold-bright shadow-lg backdrop-blur-sm transition hover:bg-china-red-deep disabled:opacity-60"
    >
      {busy ? (
        <>
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-china-gold/40 border-t-china-gold-bright" />
          生成中…
        </>
      ) : (
        <>
          {/* 下载图标 */}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path
              d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          保存图片
        </>
      )}
    </button>
  );
}
