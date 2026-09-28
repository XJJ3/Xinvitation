#!/usr/bin/env python3
"""生成微信分享卡片缩略图 src/app/opengraph-image.jpg（600x600 JPEG）。

微信聊天卡片、朋友圈都把缩略图裁成正方形小图显示，横幅图会被裁掉两侧文字，
所以直接出方图：新人合照居中 + 细金框 + 底部姓名日期。

依赖：pip install pillow；字体用 .fonts-src/lxgw.ttf（下载方式见 public/fonts/README.md）。
用法：python3 scripts/make-share-card.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PHOTO = ROOT / "public/photos/world/p05.jpg"  # 1200x1600 合照，两人脸部约在 y=380~720
FONT = ROOT / ".fonts-src/lxgw.ttf"
OUT = ROOT / "src/app/opengraph-image.jpg"  # Next 文件约定：自动注入 og:image（带内容哈希参数）

SIZE = 600
S = 2  # 先按 2 倍尺寸绘制再缩小，细线与文字边缘更干净
W = SIZE * S
GOLD = (222, 196, 140)
CREAM = (250, 243, 232)

# 以两人脸部为中心裁成正方形
src = Image.open(PHOTO).convert("RGB")
side = 1120
left, top = 40, 110
img = src.crop((left, top, left + side, top + side)).resize((W, W), Image.LANCZOS)

# 底部暖红渐变，托住文字又不压脸
grad = Image.new("L", (1, W))
for y in range(W):
    t = max(0.0, (y - W * 0.58) / (W * 0.42))
    grad.putpixel((0, y), int(245 * t**1.25))
shade = Image.new("RGB", (W, W), (74, 16, 24))
img = Image.composite(shade, img, grad.resize((W, W)))

d = ImageDraw.Draw(img)

# 细金框（双线）
for inset, width in ((22 * S, 2 * S), (30 * S, 1 * S)):
    d.rectangle([inset, inset, W - inset, W - inset], outline=GOLD, width=width)

names = ImageFont.truetype(str(FONT), 46 * S)
small = ImageFont.truetype(str(FONT), 22 * S)


def center(text: str, y: int, font: ImageFont.FreeTypeFont, fill, spacing: int = 0):
    """居中绘制，spacing 为额外字距（像素）"""
    widths = [d.textlength(ch, font=font) for ch in text]
    total = sum(widths) + spacing * (len(text) - 1)
    x = (W - total) / 2
    for ch, w in zip(text, widths):
        d.text((x, y), ch, font=font, fill=fill)
        x += w + spacing


center("徐俊杰 ♡ 鲍阳阳", int(W * 0.775), names, CREAM, 4 * S)
center("2026.11.10  ·  温州", int(W * 0.875), small, GOLD, 3 * S)

img = img.resize((SIZE, SIZE), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=0.6, percent=40))
img.save(OUT, "JPEG", quality=86, optimize=True, progressive=True)
print(f"{OUT.relative_to(ROOT)}  {OUT.stat().st_size // 1024}KB")
