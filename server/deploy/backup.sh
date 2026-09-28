#!/usr/bin/env bash
# SQLite 在线备份：VACUUM INTO 生成一致性快照（服务运行中也安全），保留最近 30 份
# crontab（invitation 用户）：15 3 * * * /opt/invitation-server/deploy/backup.sh
set -euo pipefail
# cron 的 PATH 不含 /usr/local/bin（node 装在那里）
export PATH=/usr/local/bin:/usr/bin:/bin

APP_DIR=/opt/invitation-server
DB="$APP_DIR/data/invitation.db"
OUT_DIR="$APP_DIR/data/backups"
KEEP=30

mkdir -p "$OUT_DIR"
TARGET="$OUT_DIR/invitation-$(date +%Y%m%d-%H%M%S)-$$.db"

node --disable-warning=ExperimentalWarning -e '
  const { DatabaseSync } = require("node:sqlite")
  const db = new DatabaseSync(process.argv[1])
  db.exec("VACUUM INTO \x27" + process.argv[2].replaceAll("\x27", "\x27\x27") + "\x27")
  db.close()
' "$DB" "$TARGET"

ls -1t "$OUT_DIR"/invitation-*.db | tail -n +$((KEEP + 1)) | xargs -r rm -f
echo "backup ok: $TARGET"
