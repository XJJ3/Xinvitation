// 系统字体放大对抗脚本（iOS CSS 管不住的部分由这里兜底）。
// 作为内联字符串注入 <head>，在首屏绘制前完成反向缩放，避免放大态闪烁。
export const FONT_SCALE_SCRIPT = `(function () {
  try {
    function detectScale() {
      var probe = document.createElement('div');
      probe.style.cssText = 'position:absolute;left:-9999px;top:0;font-size:100px;line-height:0;visibility:hidden;';
      document.documentElement.appendChild(probe);
      var actual = parseFloat(getComputedStyle(probe).fontSize) || 100;
      probe.remove();
      return actual / 100;
    }
    function apply() {
      var s = detectScale();
      if (s > 1.001 || s < 0.999) {
        document.documentElement.style.zoom = String(1 / s);
      }
    }
    function lockWechatFont() {
      if (typeof WeixinJSBridge === 'object' && typeof WeixinJSBridge.invoke === 'function') {
        WeixinJSBridge.invoke('setFontSizeCallback', { fontSize: 0 });
      }
    }
    if (typeof WeixinJSBridge === 'object' && typeof WeixinJSBridge.invoke === 'function') {
      lockWechatFont();
    } else {
      document.addEventListener('WeixinJSBridgeReady', lockWechatFont, false);
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', apply, false);
    } else {
      apply();
    }
    window.addEventListener('load', apply, false);
  } catch (e) {}
})();`
