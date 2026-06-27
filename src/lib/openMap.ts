// 地图跳转工具：点击后【优先唤起对应地图 App】，唤不起再回退到网页版。
//
// 坐标系说明（关键！直接混用会偏移几百米）：
// - 高德 / 腾讯 / 微信 用 GCJ-02（火星坐标）
// - 百度 用 BD-09（在 GCJ-02 上再偏移一层）
// site.ts 里的 lat/lng 按【高德标准 GCJ-02】填写，本文件跳百度前自动转 BD-09。
//
// 唤起策略：点击时立即尝试 App 私有 scheme（androidamap:// 等），并起一个定时器；
// 若用户被切走到 App（页面 hidden/blur），取消回退；否则视为「没装 App」，跳网页版兜底。
// 这样：装了 App → 直接进 App 导航；没装 → 落到网页版，绝不「点了没反应」。

export type MapPoint = {
  lat: number;
  lng: number;
  name: string; // 地点名称
  address: string; // 详细地址
};

// GCJ-02 -> BD-09（百度坐标），用于百度地图
function gcj02ToBd09(lat: number, lng: number): { lat: number; lng: number } {
  const X_PI = (Math.PI * 3000) / 180;
  const z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin(lat * X_PI);
  const theta = Math.atan2(lat, lng) + 0.000003 * Math.cos(lng * X_PI);
  return {
    lng: z * Math.cos(theta) + 0.0065,
    lat: z * Math.sin(theta) + 0.006,
  };
}

export type MapProvider = "amap" | "baidu" | "tencent";

// 平台判断
function getPlatform(): "ios" | "android" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "other";
}

// 生成 App 私有 scheme（唤起 App 内导航/标点）。
function buildAppUrl(provider: MapProvider, p: MapPoint): string {
  const name = encodeURIComponent(p.name);
  const platform = getPlatform();

  switch (provider) {
    case "amap": {
      // 高德 App scheme：iosamap:// / androidamap://，GCJ-02 直接用
      // iOS 用 path=2 进入路线规划页，dev=0 表示传入的是 GCJ-02（高德标准）
      const scheme = platform === "ios" ? "iosamap" : "androidamap";
      return (
        `${scheme}://viewMap?sourceApplication=invitation` +
        `&poiname=${name}&lat=${p.lat}&lon=${p.lng}&dev=0`
      );
    }
    case "baidu": {
      // 百度 App scheme：baidumap://，需 BD-09
      const b = gcj02ToBd09(p.lat, p.lng);
      return (
        `baidumap://map/marker?location=${b.lat},${b.lng}` +
        `&title=${name}&content=${name}&src=engagement-invitation&coord_type=bd09ll`
      );
    }
    case "tencent": {
      // 腾讯地图 App scheme：qqmap://，GCJ-02 直接用
      return (
        `qqmap://map/marker?marker=coord:${p.lat},${p.lng};title:${name};addr:${name}` +
        `&referer=engagement-invitation`
      );
    }
  }
}

// 生成网页版兜底链接（没装 App 时落地）。
function buildWebUrl(provider: MapProvider, p: MapPoint): string {
  const name = encodeURIComponent(p.name);
  const addr = encodeURIComponent(p.address);

  switch (provider) {
    case "amap":
      return (
        "https://uri.amap.com/marker?position=" +
        `${p.lng},${p.lat}&name=${name}&src=engagement-invitation&coordinate=gaode&callnative=1`
      );
    case "baidu": {
      const b = gcj02ToBd09(p.lat, p.lng);
      return (
        "https://api.map.baidu.com/marker?location=" +
        `${b.lat},${b.lng}&title=${name}&content=${addr}&output=html&coord_type=bd09ll&src=engagement-invitation`
      );
    }
    case "tencent":
      return (
        "https://apis.map.qq.com/uri/v1/marker?marker=" +
        `coord:${p.lat},${p.lng};title:${name};addr:${addr}&referer=engagement-invitation`
      );
  }
}

// 可供选择的地图列表（UI 用）
export const MAP_PROVIDERS: { key: MapProvider; label: string }[] = [
  { key: "amap", label: "高德地图" },
  { key: "baidu", label: "百度地图" },
  { key: "tencent", label: "腾讯地图" },
];

// 是否在微信内置浏览器中
export function isWeChat(): boolean {
  if (typeof navigator === "undefined") return false;
  return /micromessenger/i.test(navigator.userAgent);
}

// 跳转结果，交给 UI 决定后续提示：
// - "wechat"        微信内，无法唤起第三方 App，应引导「在浏览器打开」
// - "app-attempted" 已尝试唤起 App（移动端）；是否成功由 onNotInstalled 回调异步告知
// - "web-opened"    桌面端：已用新标签打开网页版
export type JumpResult = "wechat" | "app-attempted" | "web-opened";

// 跳转到地图：
// - 微信内：不唤起（微信屏蔽第三方 scheme），返回 "wechat" 让 UI 引导用浏览器打开
// - 移动端浏览器：直接用 location 唤起 App（iOS Safari 下 iframe 方式无效，必须用 location）。
//   点击后通过 visibilitychange 真实判断是否切到了 App：
//     · 切走了 → 唤起成功，什么都不提示
//     · ~2s 后仍在前台 → 判定未安装/未唤起，回调 onNotInstalled，由 UI 给提示
//   注：iOS 上唤不起的 scheme 会被系统静默忽略，当前页不会丢，所以无需额外保护。
// - 桌面端：新标签打开网页版，返回 "web-opened"
export function jumpToMap(
  provider: MapProvider,
  p: MapPoint,
  onNotInstalled?: () => void
): JumpResult {
  if (typeof window === "undefined") return "app-attempted";

  // 微信内：第三方 App scheme 会被拦截，直接交回 UI 引导
  if (isWeChat()) return "wechat";

  // 桌面端没有 App：新标签打开网页版，不动当前页
  if (getPlatform() === "other") {
    window.open(buildWebUrl(provider, p), "_blank", "noopener,noreferrer");
    return "web-opened";
  }

  // 移动端：真实检测是否成功切到了 App
  let switched = false;
  const onHide = () => {
    if (document.visibilityState === "hidden") switched = true;
  };
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", onHide);
  window.addEventListener("blur", onHide);

  const cleanup = () => {
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("pagehide", onHide);
    window.removeEventListener("blur", onHide);
  };

  // 直接唤起 App（iOS/Android 通用最可靠方式）
  window.location.href = buildAppUrl(provider, p);

  // 2s 后若页面仍在前台 → 视为未安装/未唤起
  window.setTimeout(() => {
    cleanup();
    if (!switched && document.visibilityState === "visible") {
      onNotInstalled?.();
    }
  }, 2000);

  return "app-attempted";
}
