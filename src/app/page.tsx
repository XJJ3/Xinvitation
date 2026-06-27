import { HomeStage } from "@/components/HomeStage";
import { WxShare } from "@/components/WxShare";
import { SiteFooter } from "@/components/SiteFooter";

export default function Home() {
  return (
    <main>
      {/* 开场序幕 + 金粉氛围 + 第一屏请柬（客户端编排） */}
      <HomeStage />
      {/* 页脚：ICP 备案号悬挂（工信部合规） */}
      <SiteFooter />
      {/* 微信分享配置（仅微信内生效）+ 分享提示按钮 */}
      <WxShare />
    </main>
  );
}
