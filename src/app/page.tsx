import { HomeStage } from "@/components/HomeStage";
import { WxShare } from "@/components/WxShare";

export default function Home() {
  return (
    <main>
      {/* 开场序幕 + 金粉氛围 + 第一屏请柬（客户端编排） */}
      <HomeStage />
      {/* 微信分享配置（仅微信内生效）+ 分享提示按钮 */}
      <WxShare />
    </main>
  );
}
