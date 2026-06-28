import { HomeStage } from "@/components/HomeStage";
import { WxShare } from "@/components/WxShare";
import { SiteFooter } from "@/components/SiteFooter";
import { BgMusic } from "@/components/BgMusic";

export default function Home() {
  return (
    <main>
      {/* 开场序幕 + 金粉氛围 + 第一屏请柬（客户端编排） */}
      <HomeStage />
      {/* 页脚：ICP 备案号悬挂（工信部合规） */}
      <SiteFooter />
      {/* 背景音乐：右上角金色唱片开关（尝试自动播 + 交互兜底补播 + 循环） */}
      <BgMusic />
      {/* 微信分享配置（仅微信内生效）+ 分享提示按钮 */}
      <WxShare />
    </main>
  );
}
