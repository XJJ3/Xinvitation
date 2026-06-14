import { InviteCard } from "@/components/InviteCard";
import { PhotoCard } from "@/components/PhotoCard";

export default function Home() {
  return (
    <main>
      {/* 第一屏：纯文字红金请柬 */}
      <InviteCard />
      {/* 第二屏：带新人合影的邀请函 */}
      <PhotoCard />
    </main>
  );
}
