export const siteConfig = {
  couple: {
    // 注意：参考图里两屏对新郎/新娘的排序不同，这里以「角色」为准，组件按需取用
    groom: {
      name: "徐俊杰",
      role: "GROOM",
    },
    bride: {
      name: "鲍阳阳",
      role: "BRIDE",
    },
    separator: "&",
  },

  event: {
    // 标准日期时间（农历等无法自动推算的信息单独列出）
    date: "2026-05-20T12:00:00+08:00",
    weekday: "星期三",
    lunar: "丙午年 农历四月初四",
    timeLabel: "午宴 12:00",
    venue: "青岛涵碧楼大酒店一号宴会厅",
    venueShort: "钻石大酒店A栋9F幸福宴会厅",
  },

  // 第一屏纯文字版文案
  hero: {
    welcomeEn: "WELCOME TO OUR ENGAGEMENT PARTY",
    title: "诚邀您来参加我们的订婚典礼",
    poem: ["红叶传情久，终觅佳人成佳偶", "佳人佳偶逢佳期，君至可添喜"],
    quoteEn: [
      "Even if the lover is across the mountain",
      "and the sea, the mountain and the sea can be levelled.",
    ],
    footerEn: "WELCOME",
  },

  // 第二屏照片版文案
  photo: {
    // 新人合影：把真实照片放到 public/photos/couple.jpg，再把下面改成 "/photos/couple.jpg"
    src: "/photos/couple-placeholder.svg",
    title: "订婚宴邀请函",
    subtitle: "诚邀你参加我们的订婚宴",
    blessings: ["敬备喜酌", "恭候光临"],
  },

  // 微信/社交分享卡片文案。缩略图由 src/app/opengraph-image.tsx 构建时自动生成，
  // 无需在此配置图片路径（Next 会自动注入 og:image 指向 /opengraph-image）。
  share: {
    title: "诚邀您见证我们的订婚之约",
    description: "我们要订婚啦,期待您的到来",
  },

  // ⚠️ 部署前必须改成你「已备案的真实域名」（含 https://，结尾不要带 /）。
  // 微信分享卡片要求 og:image / og:url 为绝对地址，靠的就是这个 url。
  url: "https://xjj-love-byy.cloud",
} as const;

export type SiteConfig = typeof siteConfig;
