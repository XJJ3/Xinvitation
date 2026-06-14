/**
 * 站点内容配置中枢
 * ------------------------------------------------------------------
 * 所有请帖文案、日期、地点、照片等内容都集中在这里。
 * 你后续只需修改本文件,无需改动任何组件代码。
 * 占位内容已用【】标注,请替换成你的真实信息。
 */

export const siteConfig = {
  /** 男女主角信息 */
  couple: {
    groom: {
      name: "【新郎姓名】",
      nickname: "【新郎昵称】",
    },
    bride: {
      name: "【新娘姓名】",
      nickname: "【新娘昵称】",
    },
    /** 连接符,会显示在两个名字之间,如 "&" 或 "❤" */
    separator: "&",
  },

  /**
   * 订婚日期时间(ISO 8601 格式)
   * 倒计时会以此为目标时间。请改成你的确切日期。
   * 例:"2026-07-18T18:00:00+08:00" 表示北京时间 2026年7月18日 18:00
   */
  eventDate: "2026-07-18T18:00:00+08:00",

  /** 宴会详情 */
  venue: {
    name: "【宴会酒店名称】",
    address: "【详细地址,如:浙江省杭州市西湖区XX路XX号】",
    hall: "【宴会厅,如:三楼宴会厅】",
    time: "【入席时间,如:晚 18:00 恭候】",
    /** 地图导航坐标(高德/腾讯地图经纬度),用于"一键导航"。可留空 */
    longitude: "120.155070",
    latitude: "30.274084",
    transportation: [
      "地铁X号线至XX站,步行5分钟",
      "公交XX路/XX路至XX站,步行3分钟",
      "停车场位于酒店地下1-3层",
    ],
    mapEmbedUrl: "https://uri.amap.com/marker?longitude=120.155070&latitude=30.274084",
  },

  /** 爱情故事时间线(展示在"我们的故事"板块) */
  story: [
    {
      date: "【年份/时间,如 2020 春】",
      title: "【初见】",
      description: "【这里写下你们相遇的故事,一两句话即可。】",
      image: "/photos/story-1.jpg",
    },
    {
      date: "【2021 夏】",
      title: "【相恋】",
      description: "【确定关系的那一刻,值得纪念的瞬间。】",
      image: "/photos/story-2.jpg",
    },
    {
      date: "【2023 冬】",
      title: "【求婚】",
      description: "【他单膝跪下的那一刻,你说了\"我愿意\"。】",
      image: "/photos/story-3.jpg",
    },
    {
      date: "【2026】",
      title: "【订婚】",
      description: "【今天,我们诚邀你见证我们的幸福。】",
      image: "/photos/story-4.jpg",
    },
  ],

  /**
   * 照片墙
   * 把照片放进 public/photos/ 目录,然后在这里填写文件名。
   * 例:src: "/photos/1.jpg"
   */
  gallery: [
    { src: "/photos/placeholder-1.svg", alt: "照片 1" },
    { src: "/photos/placeholder-2.svg", alt: "照片 2" },
    { src: "/photos/placeholder-3.svg", alt: "照片 3" },
    { src: "/photos/placeholder-4.svg", alt: "照片 4" },
  ],

  // 照片数组,用于故事和照片墙
  photos: [
    "/photos/gallery-1.jpg",
    "/photos/gallery-2.jpg",
    "/photos/gallery-3.jpg",
    "/photos/gallery-4.jpg",
  ] as const,

  /** 微信分享卡片配置(微信抓取 OG 标签时使用) */
  share: {
    title: "诚邀您见证我们的订婚之约",
    description: "我们要订婚啦,期待您的到来 ❤",
    /** 分享卡片缩略图,微信抓取此图。建议 ≥300×300 的 JPG/PNG */
    image: "/share-card.png",
  },

  /**
   * 站点正式域名(部署后填写,用于 OG 标签的绝对 URL)
   * 微信抓取 OG 图片必须是完整的 https 绝对地址。
   * 例:"https://wedding.example.com"
   */
  url: "https://your-domain.com",

  contact: {
    groom: {
      name: "【新郎姓名】",
      phone: "【新郎电话】",
    },
    bride: {
      name: "【新娘姓名】",
      phone: "【新娘电话】",
    },
  },
} as const;

export type SiteConfig = typeof siteConfig;
