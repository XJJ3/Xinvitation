"use client";

import { useEffect, useState } from "react";

// 返回组件是否已在客户端完成挂载。
// 用途：依赖「仅客户端可知」信息（如 prefers-reduced-motion、媒体查询）的组件，
// 在挂载前统一渲染占位/空，使 SSR 与客户端首次渲染输出一致，消除 hydration 不匹配。
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
