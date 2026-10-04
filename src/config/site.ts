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
    // 婚宴只设温州一处（台州场已取消）。
    // lat/lng 为地图导航坐标，采用 GCJ-02（火星坐标，高德/腾讯标准）。
    // 百度地图跳转时由 src/lib/openMap.ts 自动转 BD-09，无需在此另存百度坐标。
    venue: {
      label: "婚宴",
      time: "18:30",
      name: "裕锦大酒店",
      hall: "百合厅",
      city: "温州",
      address: "温州市永嘉县上塘镇 裕锦大酒店百合厅",
      mapName: "裕锦大酒店", // 地图气泡显示名
      lat: 28.142787, // 裕锦大酒店真实纬度（GCJ-02）
      lng: 120.677977, // 裕锦大酒店真实经度（GCJ-02）
    },
  },

  // 微信/社交分享卡片文案。缩略图是 src/app/opengraph-image.jpg（新人合照方图），
  // 由 scripts/make-share-card.py 生成，Next 按文件约定自动注入 og:image。
  // title：朋友圈只显示标题，所以姓名 + 喜讯放标题；聊天卡片在缩略图旁再显示 description，
  // 放日期与地点，宾客不点开也知道哪天、在哪。title 同时用作浏览器标签页标题。
  share: {
    title: "徐俊杰 ♡ 鲍阳阳 · 我们结婚啦",
    description: "11月10日 · 温州裕锦大酒店，诚邀您来见证我们的幸福时刻",
  },

  // ⚠️ 部署前必须改成你「已备案的真实域名」（含 https://，结尾不要带 /）。
  // 微信分享卡片要求 og:image / og:url 为绝对地址，靠的就是这个 url。
  url: "https://xjj-love-byy.cloud",

  // 请帖后端（server/，部署在腾讯云，与 invite 子域同源）。
  // 在 invite 域名下同源调用 /api；其他域名（如 EdgeOne 上的主域名）跨域调用这里，数据汇总到同一台服务器。
  apiOrigin: "https://invite.xjj-love-byy.cloud",

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
      dateZh: "十一月十日",
      dateWeekday: "星期二",
      dateEn: "NOVEMBER 10, 2026",
      venueLine: "📍 温州 · 裕锦大酒店 百合厅",
      scrollHint: "向下滑动",
    },

    // 头像与画廊照片：public/photos/wedding/（图片内容与设计稿 Unsplash 图一一对应）
    photos: {
      // 封面圆形头像：3D 画廊「后墙右」照片（p02）以两人上半身为中心裁成 600 方图
      coverAvatar: "/photos/wedding/cover-avatar-p02.jpg",
      // 3D 画廊六张（竖幅），label/sub 为画框下方的题字
      gallery: [
        { src: "/photos/wedding/gallery-1.jpg", label: "初次相遇", sub: "相遇是缘" },
        { src: "/photos/wedding/gallery-2.jpg", label: "相知相爱", sub: "共度时光" },
        { src: "/photos/wedding/gallery-3.jpg", label: "携手同行", sub: "并肩而行" },
        { src: "/photos/wedding/gallery-4.jpg", label: "永结同心", sub: "白头偕老" },
        { src: "/photos/wedding/gallery-5.jpg", label: "幸福时刻", sub: "笑颜如花" },
        { src: "/photos/wedding/gallery-6.jpg", label: "执子之手", sub: "与子偕老" },
      ],
      // 3D 画廊门厅两侧墙面的两张照片
      wallPhotos: ["/photos/wedding/flip-1.jpg", "/photos/wedding/flip-4.jpg"],
    },

    // 画廊区（第一人称「红金长廊」）
    gallery: {
      script: "婚礼画廊",
      zh: "漫步 · 光影长廊",
      loading: "画廊加载中…",
    },

    // 信件区（参考第 6 版「见字如面」）
    letter: {
      en: "A LETTER FOR YOU",
      title: "见字如面",
      // 3D 画廊画框位置名，照片跟随 worldPhotos.ts 的 PHOTO_LAYOUT
      photoSlot: "后墙左",
      photoLabel: "OUR PROMISE",
      to: "TO OUR DEAREST FAMILY & FRIENDS",
      paragraphs: [
        "展信安。这一次的好消息，我们想亲口告诉你：我们决定把未来的每一天，写进同一本书里。",
        "一路陪伴与祝福我们的你，是这份幸福里不可缺少的一页。诚邀你来见证我们的承诺。",
      ],
      quote: ["愿这封请柬，", "带去我们满满的想念与期待。"],
      signEn: "WITH ALL OUR LOVE",
      signDate: "二〇二六年十一月",
    },

    // 属于我们的画面（轮播，替换原翻转相册）
    moments: {
      en: "OUR MOMENTS",
      title: "属于我们的画面",
      // 填 3D 画廊的画框位置名，照片跟随 worldPhotos.ts 的 PHOTO_LAYOUT，改那边这里自动同步
      photos: [
        { slot: "左墙5", note: "YOU ARE MY TODAY" },
        { slot: "后墙右", note: "AND ALL OF MY TOMORROWS" },
        { slot: "舞台左", note: "FOREVER STARTS HERE" },
        { slot: "舞台右", note: "A DAY TO REMEMBER" },
        { slot: "左墙1", note: "HAND IN HAND" },
        { slot: "左墙2", note: "ALWAYS AND FOREVER" },
        { slot: "左墙3", note: "TWO HEARTS ONE HOME" },
        { slot: "左墙4", note: "LOVE IN EVERY FRAME" },
        { slot: "右墙1", note: "BY YOUR SIDE" },
        { slot: "右墙2", note: "SWEETEST DAYS" },
        { slot: "右墙3", note: "OUR LITTLE FOREVER" },
        { slot: "右墙4", note: "HAPPILY EVER AFTER" },
      ],
    },

    // 地址区（背景照片 + 毛玻璃卡片）
    venue: {
      en: "THE VENUE",
      bg: "/photos/world/p40.jpg",
      hallLabel: "宴会厅",
      timeLabel: "开席时间",
    },

    // 今日幸福签
    fortune: {
      en: "A LITTLE SURPRISE",
      title: "摇一支今日幸福签",
      bg: "/photos/world/p21.jpg",
      lead: "轻触竹筒，摇一支属于你的幸福签",
      signs: [
        ["上上签", "今天的你，会被双倍的幸福拥抱", "LUCKY IN LOVE"],
        ["桃花签", "你会遇见许多温柔，也会成为别人的温柔", "LOVE FINDS YOU"],
        ["喜乐签", "接下来的日子，好运与甜蜜都会如期而至", "JOY IS COMING"],
        ["心动签", "保持期待，下一场浪漫正在向你走来", "MAGIC AWAITS"],
        ["团圆签", "所爱之人皆在身旁，所盼之事皆有回响", "TOGETHER AGAIN"],
        ["顺遂签", "愿你所行皆坦途，所求皆如愿", "ALL IS WELL"],
        ["甜蜜签", "今天的糖分超标，请放心享用", "SWEET DAYS"],
        ["安康签", "三餐四季，温暖有趣，身体健康最重要", "STAY WELL"],
      ],
    },

    // 点亮一颗祝福 + 祝福留言墙（替换原红包）
    love: {
      en: "SEND YOUR LOVE",
      title: "点亮一颗祝福",
      orbitPhotos: ["/photos/world/s/p35.jpg", "/photos/world/s/p36.jpg", "/photos/world/s/p37.jpg"],
      baseCount: 388,
      wallTitle: "祝福留言墙",
      // 预置墙面留言
      wall: ["新婚快乐，岁岁常欢愉", "愿你们一路有花、有光、有彼此", "百年好合，甜蜜久久"],
      // 输入框默认祝福，点骰子随机更换
      presets: [
        "新婚快乐，百年好合！",
        "愿你们三餐四季，温柔有趣",
        "执子之手，与子偕老",
        "祝你们永结同心，早生贵子",
        "愿爱意长存，岁岁年年",
        "从校服到婚纱，一定要幸福呀",
        "今天的你们最好看，要一直这么甜",
        "愿往后余生，冷暖有相知，喜乐有分享",
        "琴瑟和鸣，鸾凤和鸣",
        "祝你们的爱情像今天一样闪闪发光",
        "白头偕老，恩爱如初",
        "愿你们把日子过成诗",
      ],
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
      bg: "/photos/world/p39.jpg",
      en: "Together is a beautiful place to be",
      text: "“执子之手，与子偕老”",
      source: "——《诗经·邶风·击鼓》",
    },

    // RSVP 区
    rsvp: {
      script: "敬请回复",
      zh: "RSVP · 期待您的出席",
      introPre: "您的出席是我们最珍贵的礼物",
    },

    // 页脚（新 UI 自带的装饰页脚；ICP 合规页脚由 SiteFooter 组件负责）
    footer: {
      namesLine: "徐俊杰 ♡ 鲍阳阳",
      dateLine: "2026 · 11 · 10 · WENZHOU",
      blessing: "百年好合 · 永结同心",
    },
  },
} as const;

export type SiteConfig = typeof siteConfig;
