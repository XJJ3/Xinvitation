#!/usr/bin/env python3
"""
中文字体子集化脚本（可重复运行）。

用途：把体积巨大的中文字体（霞鹜文楷、汇文明朝体）只保留页面实际用到的字符，
输出几十 KB 的 woff2，供本地自托管（避开 Google Fonts CDN，适配 EdgeOne）。

何时重跑：改了 src/config/site.ts 文案或组件里硬编码的中文后，重跑本脚本即可，
它会自动重新扫描页面用到的字并生成新的子集。

依赖：fonttools + brotli（pip install fonttools brotli）
用法：python3 scripts/subset-fonts.py
"""

import os
import re
import sys
import glob
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, ".fonts-src")
OUT_DIR = os.path.join(ROOT, "public", "fonts")

# pyftsubset 可执行文件（pip 装到用户目录，不一定在 PATH）
PYFTSUBSET = os.path.expanduser("~/Library/Python/3.9/bin/pyftsubset")
if not os.path.exists(PYFTSUBSET):
    PYFTSUBSET = "pyftsubset"  # 退回 PATH 查找

# 要子集化的中文字体：源文件 -> 输出名
FONTS = {
    "huiwen.ttf": "huiwen-mincho-subset.woff2",   # 汇文明朝体（标题/诗句）
    "lxgw.ttf": "lxgw-wenkai-subset.woff2",        # 霞鹜文楷（人名/正文）
}


def extract_rendered_chars():
    """只提取会渲染到页面的中文字符，排除代码注释。"""
    chars = set()

    # 1) site.ts：所有双引号字符串字面量里的中文（配置即文案，全部会显示）
    site = open(os.path.join(ROOT, "src/config/site.ts"), encoding="utf-8").read()
    for s in re.findall(r'"([^"]*)"', site):
        chars |= set(re.findall(r"[一-鿿]", s))

    # 2) 组件：只取 JSX 文本节点和字符串字面量里的中文，排除 // 和 /* */ 注释
    for f in glob.glob(os.path.join(ROOT, "src/components/*.tsx")) + glob.glob(
        os.path.join(ROOT, "src/app/*.tsx")
    ):
        code = open(f, encoding="utf-8").read()
        # 去掉块注释
        code = re.sub(r"/\*.*?\*/", "", code, flags=re.DOTALL)
        # 去掉行注释
        code = re.sub(r"//[^\n]*", "", code)
        # 剩下的中文即渲染内容（JSX 文本 + 字符串）
        chars |= set(re.findall(r"[一-鿿]", code))

    return chars


def build_charset():
    chars = extract_rendered_chars()
    # 加上常用标点、数字、拉丁字母（日期、地址里的 A/F/9、冒号、逗号等）
    extra = set(
        "，。、：；！？“”‘’（）《》—…·　 "        # 中文标点 + 全角空格
        ",.:;!?()[]/&-' "                          # 西文标点
        "0123456789"                               # 数字
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ"               # 大写字母
        "abcdefghijklmnopqrstuvwxyz"               # 小写字母
        "囍"                                        # 双喜（确保一定在）
    )
    return chars | extra


def subset_one(src_name, out_name, text):
    src = os.path.join(SRC_DIR, src_name)
    out = os.path.join(OUT_DIR, out_name)
    if not os.path.exists(src):
        print(f"  ✗ 源字体缺失：{src}（请先下载到 .fonts-src/）")
        return False
    cmd = [
        PYFTSUBSET, src,
        f"--text={text}",
        "--flavor=woff2",
        f"--output-file={out}",
        "--layout-features=*",   # 保留连字等排版特性
        "--no-hinting",          # 网页不需要 hinting，进一步减体积
    ]
    subprocess.run(cmd, check=True)
    kb = os.path.getsize(out) / 1024
    print(f"  ✓ {out_name}  {kb:.1f} KB")
    return True


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    charset = build_charset()
    text = "".join(sorted(charset))
    print(f"页面用到的字符集：{len(charset)} 个")
    print(text)
    print("-" * 50)
    ok = True
    for src_name, out_name in FONTS.items():
        ok = subset_one(src_name, out_name, text) and ok
    if not ok:
        sys.exit(1)
    print("-" * 50)
    print("完成。若改了文案，重跑本脚本即可。")


if __name__ == "__main__":
    main()
