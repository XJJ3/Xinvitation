// 拉起地图导航的工具：
// - 微信内置浏览器：用 JS-SDK wx.openLocation 弹出微信内置地图（带导航/到这去）
// - 非微信环境：跳转腾讯地图 URL（marker 标点），微信外可正常打开 App / 网页
//
// 注意：wx.openLocation 需要在 wx.config 的 jsApiList 里声明（见 WxShare.tsx）。
// 坐标使用国内通用的 GCJ-02（火星坐标），与高德/腾讯地图一致。

export type MapPoint = {
  lat: number;
  lng: number;
  name: string; // 气泡标题
  address: string; // 详细地址
};

function isWeChat() {
  if (typeof navigator === "undefined") return false;
  return /micromessenger/i.test(navigator.userAgent);
}

export function openMap(point: MapPoint) {
  const { lat, lng, name, address } = point;

  // 微信内：优先用 JS-SDK 内置地图
  if (isWeChat() && typeof window !== "undefined" && window.wx) {
    try {
      window.wx.openLocation({
        latitude: lat,
        longitude: lng,
        name,
        address,
        scale: 16,
      });
      return;
    } catch {
      // 落到下面的兜底跳转
    }
  }

  // 兜底：腾讯地图标点页（微信外能正常打开）
  const url =
    "https://apis.map.qq.com/uri/v1/marker?marker=" +
    `coord:${lat},${lng};title:${encodeURIComponent(name)};addr:${encodeURIComponent(address)}` +
    "&referer=engagement-invitation";
  window.open(url, "_blank");
}
