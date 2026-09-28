#!/usr/bin/env bash
# 请帖静态站发布到腾讯云（invite.xjj-love-byy.cloud）：静态导出 → rsync 到 nginx 站点目录
# 用法：./scripts/deploy-web.sh        （默认 SSH_HOST=xinvitation）
# 不带 --delete：旧版本的 _next/static 分块保留，避免微信缓存的旧页面加载不到脚本
set -euo pipefail

SSH_HOST=${SSH_HOST:-xinvitation}
WEB_ROOT=${WEB_ROOT:-/var/www/xinvitation}
cd "$(dirname "$0")/.."

# 字体从 Google 下载，网络偶尔超时，失败自动重试
for i in 1 2 3; do
  STATIC_EXPORT=1 pnpm build && break
  [ "$i" = 3 ] && { echo "构建失败"; exit 1; }
  echo "构建失败，重试第 $((i + 1)) 次…"
done

# macOS 自带 rsync 不支持 --chmod，权限在服务器上统一修正
rsync -rltz out/ "$SSH_HOST:$WEB_ROOT/"
ssh "$SSH_HOST" "chown -R root:root $WEB_ROOT && find $WEB_ROOT -type d -exec chmod 755 {} + && find $WEB_ROOT -type f -exec chmod 644 {} +"
echo "已发布到 $SSH_HOST:$WEB_ROOT"
