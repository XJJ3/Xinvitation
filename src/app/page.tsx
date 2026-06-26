import { InviteCard } from "@/components/InviteCard";
import { PhotoCard } from "@/components/PhotoCard";
import { WxShare } from "@/components/WxShare";

export default function Home() {
  return (
    <main>
      {/* 第一屏：纯文字红金请柬 */}
      <InviteCard />
      {/* 第二屏：带新人合影的邀请函 */}
      <PhotoCard />
      {/* 微信分享配置（仅微信内生效）+ 分享提示按钮 */}
      <WxShare />
    </main>
  );
}
