#!/usr/bin/env bash
# 本机一键发布到服务器：本地编译 → rsync 上传 → 远端安装生产依赖 → 重启服务
# 用法：./deploy/deploy.sh            （默认 SSH_HOST=xinvitation，即 ~/.ssh/config 里的别名）
#       SSH_HOST=root@1.2.3.4 ./deploy/deploy.sh
set -euo pipefail

SSH_HOST=${SSH_HOST:-xinvitation}
# 服务器在国内，依赖从 npmmirror 安装
REGISTRY=${REGISTRY:-https://registry.npmmirror.com}
APP_DIR=/opt/invitation-server
cd "$(dirname "$0")/.."

pnpm install --ignore-workspace --frozen-lockfile
pnpm build

rsync -az --delete --no-owner --no-group \
  --exclude node_modules --exclude data --exclude .env --exclude src \
  ./ "$SSH_HOST:$APP_DIR/"

ssh "$SSH_HOST" "set -e
  export PATH=/usr/local/bin:\$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0
  export COREPACK_NPM_REGISTRY=$REGISTRY npm_config_registry=$REGISTRY
  cd $APP_DIR
  corepack pnpm install --prod --frozen-lockfile --ignore-workspace
  chown -R root:root $APP_DIR && chmod +x deploy/*.sh
  mkdir -p data && chown -R invitation:invitation data
  [ -f .env ] && chown root:invitation .env && chmod 640 .env
  if ! systemctl cat invitation-server >/dev/null 2>&1; then
    echo '代码已上传；服务尚未安装，请按 README「服务器首次安装」完成配置'
    exit 0
  fi
  systemctl restart invitation-server
  sleep 1
  curl -fsS http://127.0.0.1:3100/api/health && echo ' <- health ok'"
