import WeddingApp from "@/components/wedding/App";
import { WxShare } from "@/components/WxShare";
import { SiteFooter } from "@/components/SiteFooter";
import { BgMusic } from "@/components/BgMusic";

export default function Home() {
  return (
    <main>
      {/* 婚礼请帖新 UI（封面 / 3D 画廊 / 翻转相册 / 红包 / 详情 / RSVP） */}
      <WeddingApp />
      {/* 页脚：ICP 备案号悬挂（工信部合规） */}
      <SiteFooter />
      {/* 背景音乐：右上角金色唱片开关（尝试自动播 + 交互兜底补播 + 循环） */}
      <BgMusic />
      {/* 微信分享配置（仅微信内生效）+ 分享提示按钮 */}
      <WxShare />
    </main>
  );
}
