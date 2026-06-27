import { siteConfig } from "@/config/site";

// 页脚：悬挂 ICP 备案号（工信部合规要求，须链接至 beian.miit.gov.cn）。
// 设计上极尽克制——延续深红底色、极小极淡的灰金小字，融入背景不抢戏，
// 仅在必要的合规位置低声存在；hover 时才微微显形。
export function SiteFooter() {
  return (
    <footer className="w-full bg-china-red-deep px-6 pb-5 pt-2 text-center">
      <a
        href="https://beian.miit.gov.cn/"
        target="_blank"
        rel="noopener noreferrer"
        className="font-kai text-[10px] tracking-wide text-china-gold/25 transition-colors hover:text-china-gold/55"
      >
        {siteConfig.icp}
      </a>
    </footer>
  );
}
