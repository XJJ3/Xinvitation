// 微信内置浏览器「系统字体放大」对抗脚本。
// 背景：微信「我 → 设置 → 通用 → 字体大小」会同步影响内置浏览器里的 H5 文字，
// 老年手机常把字体调到最大，导致固定尺寸的邀请函文字溢出容器、布局错乱。
//
// 机制（经官方文档与 Chromium TextZoom 源码核实）：
// 1. iOS 微信 = 给 body 注入 -webkit-text-size-adjust 百分比（渲染层缩放），
//    由 globals.css 的 body { -webkit-text-size-adjust: 100% !important } 覆盖即可。
// 2. Android 微信（XWeb 内核，基于 Chromium）= Blink TextZoom 在「计算样式层」放大
//    font-size / line-height / em，不放大 px 盒子；CSS 完全无法关闭，只能用官方
//    JSAPI 把字体档位锁回标准档（'2'），并监听用户手动改字号的事件重新锁定。
//    注意：不能用 css zoom 去对冲——zoom 会缩放所有盒子（含 px 尺寸/图片），
//    与 TextZoom 的「只缩字不缩盒」不对称，反而加剧错乱；rem 补偿也只对 rem 布局有效。
export const FONT_SCALE_SCRIPT = `(function () {
  try {
    function lockFont() {
      if (typeof WeixinJSBridge === 'object' && typeof WeixinJSBridge.invoke === 'function') {
        // 官方标准档位：fontSize 为档位编号，'2' = 标准（Android 8 档 / iOS 6 档）
        WeixinJSBridge.invoke('setFontSizeCallback', { fontSize: '2' });
      }
    }
    function onBridgeReady() {
      lockFont();
      if (typeof WeixinJSBridge === 'object' && typeof WeixinJSBridge.on === 'function') {
        // 用户在右上角「…」菜单里调整字体时会触发，重新锁回标准
        WeixinJSBridge.on('menu:setfont', function () {
          lockFont();
        });
      }
    }
    if (typeof WeixinJSBridge === 'object' && typeof WeixinJSBridge.invoke === 'function') {
      onBridgeReady();
    } else {
      document.addEventListener('WeixinJSBridgeReady', onBridgeReady, false);
    }
  } catch (e) {}
})();`
