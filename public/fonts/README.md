# 字体说明

本站所有字体均**本地自托管**，不依赖 Google Fonts CDN（部署在腾讯 EdgeOne，国内访问 gstatic 会失败）。
全部为可商用授权，OFL 要求保留的授权文本见本目录 `LICENSE-*.txt`。

## 字体清单

| 文件 | 字体 | 用途 | 授权 | 来源 |
|---|---|---|---|---|
| `huiwen-mincho-subset.woff2` | 汇文明朝体（修正版）| 中文标题 / 诗句（`.font-mincho`、正文默认）| CC0-1.0 公共领域 | [bosswnx/huiwenmincho-improved](https://github.com/bosswnx/huiwenmincho-improved) |
| `lxgw-wenkai-subset.woff2` | 霞鹜文楷 | 中文人名 / 书法标题（`.font-kai`）| SIL OFL 1.1 | [lxgw/LxgwWenKai](https://github.com/lxgw/LxgwWenKai) |
| `ebgaramond-regular.woff2`<br>`ebgaramond-italic.woff2` | EB Garamond | 英文装饰（`font-serif`：WELCOME / GROOM / BRIDE / AND 等）| SIL OFL 1.1 | [octaviopardo/EBGaramond12](https://github.com/octaviopardo/EBGaramond12) |

> OFL 唯一限制：字体文件本身不得单独出售。嵌入网页、自托管完全合法。

## 两个中文字体为什么是 `-subset`

原始 ttf 各约 24MB，整文件上线会拖垮加载（尤其微信）。
所以用 `scripts/subset-fonts.py` 只提取页面实际用到的约 200 个字符，
压成 woff2 后分别只有 ~83KB / ~45KB。

## 改了文案后如何重新生成子集

如果你改了 `src/config/site.ts` 的文案或组件里硬编码的中文（新增了页面会显示的字），
需要重新生成子集，否则新字会显示为系统回退字体（楷体/宋体）。步骤：

```bash
# 1. 准备工具（只需一次）
python3 -m pip install fonttools brotli

# 2. 重新下载原始字体到 .fonts-src/（该目录被 gitignore，不在仓库里）
mkdir -p .fonts-src
curl -L -o .fonts-src/lxgw.ttf   https://github.com/lxgw/LxgwWenKai/releases/download/v1.520/LXGWWenKai-Regular.ttf
curl -L -o .fonts-src/huiwen.ttf https://github.com/bosswnx/huiwenmincho-improved/releases/download/20241203/Huiwenmincho-improved.ttf

# 3. 重新生成子集（自动扫描页面用到的字）
python3 scripts/subset-fonts.py
```

脚本会自动从 `site.ts` 和组件里提取**会渲染的中文**（排除代码注释），无需手动维护字符列表。

## 分享卡片缩略图

`src/app/opengraph-image.jpg` 由 `scripts/make-share-card.py` 用 `.fonts-src/lxgw.ttf` 直接绘制，
不需要单独的字体子集。改了姓名、日期或换合照后重跑：

```bash
python3 scripts/make-share-card.py
```
