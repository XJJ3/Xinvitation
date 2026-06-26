import { InviteCard } from "@/components/InviteCard";
// import { PhotoCard } from "@/components/PhotoCard"; // 暂时隐藏第二屏
import { WxShare } from "@/components/WxShare";

export default function Home() {
  return (
    <main>
      {/* 第一屏：纯文字红金请柬 */}
      <InviteCard />
      {/* 第二屏：带新人合影的邀请函（暂时隐藏，待照片就绪后恢复） */}
      {/* <PhotoCard /> */}
      {/* 微信分享配置（仅微信内生效）+ 分享提示按钮 */}
      <WxShare />
    </main>
  );
}
