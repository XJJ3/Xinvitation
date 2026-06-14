"use client";

import { siteConfig } from "@/config/site";

export function Footer() {
  return (
    <footer className="py-8 text-center text-sm text-romantic-pink-soft">
      <div className="container mx-auto px-4">
        <p>我们将于 {siteConfig.eventDate} 迎接崭新的开始</p>
        <p className="mt-2">© {new Date().getFullYear()} {siteConfig.couple.groom.name} & {siteConfig.couple.bride.name}. 保留所有权利.</p>
      </div>
    </footer>
  );
}