import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
