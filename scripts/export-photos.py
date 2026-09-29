#!/usr/bin/env python3
"""
从精修原图重新导出 3D 画廊 / 请帖页面用的照片（public/photos/world/）。

  python3 scripts/export-photos.py [原图目录]      默认 ~/Desktop/精修_副本

每张原图（约 8736×11648，多为 Adobe RGB）导出：
  pNN.jpg     长边 1600  请帖页面 + 画廊的 JPEG 兜底
  s/pNN.jpg   长边 760   小圆图等小尺寸位置
  h/pNN.jpg   长边 2048  画廊走近照片时按需加载的高清版
  以及 .ktx2-src/pNN_WxH.rgba（长边 1600 的原始 RGBA，宽高取 4 的倍数），
  供 scripts/encode-ktx2.mjs 编码成 k/pNN.ktx2（画廊常驻纹理）。

处理：JPEG 解码阶段先按 2 倍目标尺寸缩小（draft），Adobe RGB → sRGB 色彩转换，
Lanczos 缩放后按档位轻度锐化，JPEG 渐进式保存。不嵌入 ICC：浏览器与 WebGL 均按 sRGB 解释。
"""
import io
import os
import sys

from PIL import Image, ImageCms, ImageFilter, ImageOps

Image.MAX_IMAGE_PIXELS = None

# 序号（从 1 开始）与 src/config/worldPhotos.ts 的 WORLD_PHOTOS 一一对应
SOURCES = [
    "后墙左", "后墙右", "舞台左", "舞台右",
    "左墙1", "左墙2", "左墙3", "左墙4", "左墙5", "左墙6", "左墙7", "左墙8",
    "右墙1", "右墙2", "右墙3", "右墙4", "右墙5", "右墙6", "右墙7", "右墙8",
    "草坪1", "草坪2", "草坪3", "草坪4", "草坪5", "草坪6", "草坪7",
    "草坪8", "草坪9", "草坪10", "草坪11", "草坪12", "草坪13", "草坪14",
    "7.1_0256", "CP4", "DSCF4935", "DSCF5011", "DSCF5038", "DSCF5151_(2) 拷贝", "DSCF5177",
]

# 档位：(子目录, 长边, JPEG 质量, 锐化半径, 锐化强度)
TIERS = [
    ("", 1600, 88, 0.8, 70),
    ("s", 760, 86, 0.6, 60),
    ("h", 2048, 86, 0.9, 60),
]
KTX_LONG = 1600

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "photos", "world")
KTX_SRC = os.path.join(ROOT, ".ktx2-src")
SRGB = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB"))


def fit(w, h, long_edge):
    k = long_edge / max(w, h)
    return max(1, round(w * k)), max(1, round(h * k))


def to_srgb(im):
    icc = im.info.get("icc_profile")
    if not icc:
        return im.convert("RGB")
    src = ImageCms.ImageCmsProfile(io.BytesIO(icc))
    if "sRGB" in ImageCms.getProfileDescription(src):
        return im.convert("RGB")
    return ImageCms.profileToProfile(
        im.convert("RGB"), src, SRGB,
        renderingIntent=ImageCms.Intent.RELATIVE_COLORIMETRIC,
        outputMode="RGB",
        flags=ImageCms.Flags.BLACKPOINTCOMPENSATION,
    )


def export_one(idx, name, src_dir):
    path = os.path.join(src_dir, name + ".jpg")
    im = Image.open(path)
    icc = im.info.get("icc_profile")
    # 解码阶段直接缩到 ≥ 2 倍最大档尺寸，1 亿像素原图的解码与色彩转换快一个数量级
    ow, oh = im.size
    need = fit(ow, oh, max(t[1] for t in TIERS) * 2)
    im.draft("RGB", need)
    if icc:
        im.info["icc_profile"] = icc
    im = ImageOps.exif_transpose(im)
    im.info["icc_profile"] = icc
    base = to_srgb(im)
    w, h = base.size
    sizes = {}
    for sub, long_edge, quality, radius, percent in TIERS:
        tw, th = fit(w, h, long_edge)
        out = base.resize((tw, th), Image.LANCZOS).filter(
            ImageFilter.UnsharpMask(radius=radius, percent=percent, threshold=2))
        d = os.path.join(OUT, sub)
        os.makedirs(d, exist_ok=True)
        out.save(os.path.join(d, f"p{idx:02d}.jpg"), "JPEG",
                 quality=quality, optimize=True, progressive=True)
        sizes[sub or "src"] = (tw, th)
    # KTX2 源：宽高取 4 的倍数（压缩块 4×4），比例偏差 < 0.3%
    kw, kh = fit(w, h, KTX_LONG)
    kw, kh = max(4, round(kw / 4) * 4), max(4, round(kh / 4) * 4)
    k = base.resize((kw, kh), Image.LANCZOS).filter(
        ImageFilter.UnsharpMask(radius=0.8, percent=70, threshold=2)).convert("RGBA")
    os.makedirs(KTX_SRC, exist_ok=True)
    with open(os.path.join(KTX_SRC, f"p{idx:02d}_{kw}x{kh}.rgba"), "wb") as f:
        f.write(k.tobytes())
    return sizes


def main():
    src_dir = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else "~/Desktop/精修_副本")
    for i, name in enumerate(SOURCES, 1):
        s = export_one(i, name, src_dir)
        print(f"p{i:02d} {name}: " + "  ".join(f"{k}={v[0]}x{v[1]}" for k, v in s.items()), flush=True)


if __name__ == "__main__":
    main()
