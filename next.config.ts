import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // STATIC_EXPORT=1 时产出纯静态 out/ 目录（HTML/CSS/JS），供自建 nginx 服务器托管，无需 Node 运行时。
  // 不设此变量时（如 EdgeOne 构建）保持原行为，避免影响既有部署与 node-functions 边缘函数。
  ...(process.env.STATIC_EXPORT === "1" ? { output: "export" as const } : {}),
  turbopack: {
    root: __dirname,
  },
  // 纯静态前端、无 Node 服务器，关闭服务端图片优化。
  // 这样 Next 不再依赖原生 sharp，彻底消除 EdgeOne 安装阶段的 sharp 构建脚本报错。
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
