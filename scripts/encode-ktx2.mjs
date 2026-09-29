// 把 scripts/export-photos.py 输出的 .ktx2-src/pNN_WxH.rgba 编码成 public/photos/world/k/pNN.ktx2
// （ETC1S 质量拉满，含 mipmap，sRGB）。画廊常驻纹理用它：GPU 端直接转成 ETC2/BC1 等压缩格式，
// 显存约为同尺寸 JPEG 解码后的 1/8，也不需要在主线程解码大图。近看时画廊会换成 h/ 下的 2048 高清 JPEG，
// ETC1S 的块状压缩痕迹只在 1:1 以上放大时可见，常驻档位不受影响。
// （UASTC 画质更好但每张约 1.3MB，41 张约 55MB，不适合微信里下载。）
//   python3 scripts/export-photos.py && node scripts/encode-ktx2.mjs
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodeToKTX2 } from "ktx2-encoder";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const srcDir = path.join(root, ".ktx2-src");
const outDir = path.join(root, "public", "photos", "world", "k");
await mkdir(outDir, { recursive: true });

const files = (await readdir(srcDir)).filter((f) => f.endsWith(".rgba")).sort();
for (const f of files) {
  const [, name, w, h] = f.match(/^(p\d+)_(\d+)x(\d+)\.rgba$/);
  const raw = await readFile(path.join(srcDir, f));
  const t0 = Date.now();
  const ktx = await encodeToKTX2(new Uint8Array(raw), {
    isUASTC: false,
    qualityLevel: 255,
    compressionLevel: 4,
    generateMipmap: true,
    isPerceptual: true,
    isSetKTX2SRGBTransferFunc: true,
    // 压缩纹理上传时不能像 <img> 那样由 WebGL 翻转，编码时预先上下翻转
    isYFlip: true,
    imageDecoder: async (buf) => ({ data: buf, width: Number(w), height: Number(h) }),
  });
  await writeFile(path.join(outDir, `${name}.ktx2`), ktx);
  console.log(`${name} ${w}x${h} → ${(ktx.byteLength / 1024).toFixed(0)} KB  ${Date.now() - t0}ms`);
}
