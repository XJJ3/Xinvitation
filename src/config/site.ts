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
    separator: "♡",
  },

  event: {
    // 2026年11月10日 星期二，丙午年农历十月初二（已核实）
    date: "2026-11-10T11:30:00+08:00",
    weekday: "星期二",
    lunar: "丙午年 农历十月初二",
    // 同一天两场宴席：午宴 + 晚宴，各自地址与时间
    // lat/lng 为地图导航坐标，采用 GCJ-02（火星坐标，高德/腾讯标准）。
    // 百度地图跳转时由 src/lib/openMap.ts 自动转 BD-09，无需在此另存百度坐标。
    banquets: [
      {
        label: "午宴",
        time: "11:30",
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

  // 微信/社交分享卡片文案。缩略图由 src/app/opengraph-image.tsx 构建时自动生成，
  // 无需在此配置图片路径（Next 会自动注入 og:image 指向 /opengraph-image）。
  // title 同时用作浏览器标签页标题；现代温馨风、以新人姓名为主，不用花哨 emoji。
  share: {
    title: "徐俊杰 ♡ 鲍阳阳 · 结婚请柬",
    description: "我们结婚啦，诚邀您来见证这份喜悦与幸福 ♡",
    // 缩略图（og:image）专用文案：用 og 子集字体渲染，改字需同步重做 og 字体子集
    // （public/fonts/og-lxgw-subset.woff，生成命令见 public/fonts/README.md），否则缺字成豆腐块。
    ogDescription: "诚邀您参加我们的婚礼",
  },

  // ⚠️ 部署前必须改成你「已备案的真实域名」（含 https://，结尾不要带 /）。
  // 微信分享卡片要求 og:image / og:url 为绝对地址，靠的就是这个 url。
  url: "https://xjj-love-byy.cloud",

  // 工信部 ICP 备案号：网站底部须悬挂并链接至 beian.miit.gov.cn（合规要求）。
  // 用带「-1」的网站备案号（主体备案号 浙ICP备2026046994号 是主体级，网站挂 -1 这条）。
  icp: "浙ICP备2026046994号-1",

  // 背景音乐：文件放在 public/music/ 下（src 为站点根相对路径，勿用带 # / 空格的文件名）。
  music: {
    src: "/music/bgm.mp3",
    title: "A Thousand Years",
    artist: "Christina Perri",
  },

  // ══════════ 婚礼请帖新 UI 专用文案（src/components/wedding/App.tsx 消费）══════════
  wedding: {
    // 封面屏
    cover: {
      tagEn: "— WEDDING INVITATION —",
      // 封面日期区文案（中文行 + 英文行）
      dateZhYear: "公元二〇二六年",
      dateZh: "十一月十日 · 星期二",
      dateEn: "NOVEMBER 10, 2026 · TUESDAY",
      venueLine: "📍 台州 · 辰阳大酒店 / 温州 · 裕锦大酒店",
      scrollHint: "向下滑动",
    },

    // 头像与画廊照片：public/photos/wedding/（图片内容与设计稿 Unsplash 图一一对应）
    photos: {
      // 封面圆形头像（1200x1200 方图）
      coverAvatar: "/photos/wedding/cover-avatar.jpg",
      // 3D 画廊六张（竖幅），label/sub 为画框下方的题字
      gallery: [
        { src: "/photos/wedding/gallery-1.jpg", label: "初次相遇", sub: "相遇是缘" },
        { src: "/photos/wedding/gallery-2.jpg", label: "相知相爱", sub: "共度时光" },
        { src: "/photos/wedding/gallery-3.jpg", label: "携手同行", sub: "并肩而行" },
        { src: "/photos/wedding/gallery-4.jpg", label: "永结同心", sub: "白头偕老" },
        { src: "/photos/wedding/gallery-5.jpg", label: "幸福时刻", sub: "笑颜如花" },
        { src: "/photos/wedding/gallery-6.jpg", label: "执子之手", sub: "与子偕老" },
      ],
      // 翻转相册四张（正/背两两配对）
      flips: [
        { front: "/photos/wedding/flip-1.jpg", back: "/photos/wedding/flip-2.jpg", frontLabel: "心动时刻", backLabel: "爱你如初" },
        { front: "/photos/wedding/flip-3.jpg", back: "/photos/wedding/flip-4.jpg", frontLabel: "相知相守", backLabel: "永结同心" },
        { front: "/photos/wedding/flip-2.jpg", back: "/photos/wedding/flip-1.jpg", frontLabel: "携手同行", backLabel: "幸福永恒" },
        { front: "/photos/wedding/flip-4.jpg", back: "/photos/wedding/flip-3.jpg", frontLabel: "爱的誓言", backLabel: "你是我的全部" },
      ],
    },

    // 画廊区（第一人称「红金长廊」）
    gallery: {
      script: "婚礼画廊",
      zh: "漫步 · 光影长廊",
      intro: ["走进专属婚礼画廊，欣赏我们最美的时刻", "摇杆走动 · 拖动环视 · 点击画作细看"],
      loading: "画廊加载中…",
    },

    // 翻转相册区
    flip: {
      script: "翻转相册",
      zh: "点击翻转·探索故事",
      intro: ["每一张照片背后都有一个故事", "轻触翻转，发现我们的秘密"],
      hint: "◇ 点击卡片翻转 ◇",
    },

    // 红包互动区
    redEnvelope: {
      script: "祝福红包",
      zh: "互动礼物",
      intro: ["新婚大喜之日，送上诚挚祝福", "点击红包，开启美好祝愿"],
      tapToOpen: "点击开启",
      blessingTitle: "幸福美满",
      blessingLines: ["新婚快乐", "百年好合", "永结同心"],
      received: "❤ 祝福已收到 ❤",
    },

    // 婚礼详情区（日期/时间等摘要卡 + 当日行程）
    details: {
      script: "婚礼详情",
      zh: "WEDDING DETAILS",
      timelineTitle: "— 当日行程（点击查看详情）—",
      timeline: [
        { time: "10:30", title: "宾客签到", icon: "📝", desc: "请携邀请函，于宴会厅大堂签到。着盛装出席，喜迎新人。" },
        { time: "11:00", title: "婚礼仪式", icon: "💒", desc: "婚礼仪式正式开始，神圣庄严，见证两人的誓言。" },
        { time: "12:30", title: "拍照留念", icon: "📸", desc: "与新人在婚礼场地各处合影，记录美好瞬间。" },
        { time: "13:00", title: "午间茶点", icon: "🍵", desc: "享用精心准备的茶点，宾主尽欢。" },
        { time: "18:00", title: "婚宴晚宴", icon: "🥂", desc: "盛宴正式开始，共举杯，庆贺新人百年好合！" },
      ],
    },

    // 诗句引言区
    quote: {
      text: "“执子之手，与子偕老”",
      source: "——《诗经·邶风·击鼓》",
    },

    // RSVP 区
    rsvp: {
      script: "敬请回复",
      zh: "RSVP · 期待您的出席",
      introPre: "您的出席是我们最珍贵的礼物",
      // TODO(占位)：回复截止日期，上线前确认
      deadline: "请于 2026年10月20日前",
      deadlineSuffix: "告知是否赴宴",
      contactsTitle: "— 联系新人 —",
      // TODO(占位)：以下为占位电话，上线前替换为真实号码
      contacts: [
        { name: "新郎 俊杰", phone: "138-0000-0001" },
        { name: "新娘 阳阳", phone: "138-0000-0002" },
      ],
    },

    // 页脚（新 UI 自带的装饰页脚；ICP 合规页脚由 SiteFooter 组件负责）
    footer: {
      namesLine: "徐俊杰 ♡ 鲍阳阳",
      dateLine: "2026 · 11 · 10 · TAIZHOU & WENZHOU",
      blessing: "百年好合 · 永结同心",
    },
  },
} as const;

export type SiteConfig = typeof siteConfig;
