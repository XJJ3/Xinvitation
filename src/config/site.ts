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
    // 2026年7月21日 星期二，丙午年农历六月初八（已用 lunardate 双向校验）
    date: "2026-07-21T11:00:00+08:00",
    weekday: "星期二",
    lunar: "丙午年 农历六月初八",
    // 同一天两场宴席：午宴 + 晚宴，各自地址与时间
    // lat/lng 为地图导航坐标，采用 GCJ-02（火星坐标，高德/腾讯标准）。
    // 百度地图跳转时由 src/lib/openMap.ts 自动转 BD-09，无需在此另存百度坐标。
    banquets: [
      {
        label: "午宴",
        time: "11:00",
        venue: "台州市黄岩区院桥镇 辰阳大酒店四楼牡丹厅",
        mapName: "辰阳大酒店", // 地图气泡显示名
        mapImage: "/maps/address_1.png", // 真实地图截图（缺失则回退底纹）
        lat: 28.55399, // 辰阳大酒店真实纬度（GCJ-02）
        lng: 121.255902, // 辰阳大酒店真实经度（GCJ-02）
      },
      {
        label: "晚宴",
        time: "18:30",
        venue: "温州市永嘉县上塘镇 裕锦大酒店千禧厅",
        mapName: "裕锦大酒店", // 地图气泡显示名
        mapImage: "/maps/address_2.png", // 真实地图截图（缺失则回退底纹）
        lat: 28.142787, // 裕锦大酒店真实纬度（GCJ-02）
        lng: 120.677977, // 裕锦大酒店真实经度（GCJ-02）
      },
    ],
  },

  // 第一屏纯文字版文案
  hero: {
    welcomeEn: "WELCOME TO OUR ENGAGEMENT PARTY",
    title: "诚邀您来参加我们的订婚宴",
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
    title: "我们订婚啦🎆🎇🎆",
    description: "诚邀您参加我们的订婚宴！",
  },

  // ⚠️ 部署前必须改成你「已备案的真实域名」（含 https://，结尾不要带 /）。
  // 微信分享卡片要求 og:image / og:url 为绝对地址，靠的就是这个 url。
  url: "https://xjj-love-byy.cloud",

  // 工信部 ICP 备案号：网站底部须悬挂并链接至 beian.miit.gov.cn（合规要求）。
  // 用带「-1」的网站备案号（主体备案号 浙ICP备2026046994号 是主体级，网站挂 -1 这条）。
  icp: "浙ICP备2026046994号-1",
} as const;

export type SiteConfig = typeof siteConfig;
