# 请帖后端 invitation-server

记录宾客**访问/点击量**与**祝福留言**，给前端「点亮一颗祝福」提供真实计数和共享祝福墙，
并提供**后台网页** `/admin`（概览、点亮名单、宾客、祝福管理、导出）。

不做微信授权，不收集昵称头像。宾客标识（见前端 `src/lib/guestId.ts`）：

| 字段 | 来源 | 用途 |
|---|---|---|
| `vid` 宾客 ID | 首次访问随机生成 128 位，存 localStorage + cookie 双份 | 统计主键，保证不同宾客不会被合并 |
| `fp` 浏览器指纹 | 由设备/浏览器特征（UA、屏幕、时区、Canvas、WebGL 等）计算 | 仅辅助：清缓存后不变，后台用来提示「同指纹 N 人」 |
| 宾客编号 `#no` | 服务端按首次到访先后分配 | 后台展示用 |

> 指纹不能当主键：同型号 iPhone + 同版本微信的指纹几乎相同，会把不同宾客算成一个人。
> 「同指纹 N 人」既可能是同一人清了缓存/换了浏览器，也可能只是同款手机，需结合 IP、时间判断。

技术栈：Node ≥ 22.13（内置 `node:sqlite`，无原生依赖）+ Fastify 5 + SQLite（WAL）。

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| POST | `/api/track` | 埋点 `{ vid, fp?, type }`，type ∈ visit / love / fortune / blessing / share / nav / music |
| GET | `/api/love?vid=` | `{ count, lit }` 累计点亮点击次数、本访客是否已点亮 |
| POST | `/api/love` | `{ vid, fp? }` 点亮（每访客只点亮一次，每次点击都累计一条 love 事件） |
| POST | `/api/rsvp` | `{ vid, fp?, name, attending, guests? }` 赴约回执：姓名（≤20 字）+ 出席状态 + 出席人数落库到 visitors |
| GET | `/api/blessings?limit=100` | 祝福墙（不含已隐藏） |
| GET | `/api/wx-signature?url=` | 微信 JS-SDK 签名 `{ appId, timestamp, nonceStr, signature }`（仅允许 `WX_SIGN_DOMAINS` 下的页面） |
| POST | `/api/blessings` | `{ vid, fp?, content }`，≤40 字，屏蔽网址/长数字/广告词，每 IP 每分钟 6 条 |
| GET | `/admin` | 后台网页（页面本身不含数据，输入令牌后调用下列管理接口） |
| GET | `/api/admin/stats` | PV/宾客数/指纹数、点亮数、各类点击量、按天统计 |
| GET | `/api/admin/lights` | 点亮名单：宾客编号、点亮时间、设备、IP、打开/点爱心/祝福次数、同指纹人数 |
| GET | `/api/admin/visitors` | 全部宾客（同上字段） |
| GET | `/api/admin/blessings` | 全部祝福（含隐藏，带宾客编号） |
| PATCH | `/api/admin/blessings/:id` | `{ hidden: true/false }` 隐藏/恢复 |
| GET | `/api/admin/export/:kind` | 导出 CSV，kind ∈ lights / visitors / blessings / events |

管理接口需 `Authorization: Bearer <ADMIN_TOKEN>`；未配置或少于 16 位时管理接口整体禁用。
所有错误统一返回 `{ "error": "中文提示" }`。

> `visitors` 表含 `name`（姓名）、`attending`（0=缺席 1=赴约 NULL=未回复）、`guests`（出席人数）三个可选列，
> 由启动时的幂等迁移自动补齐，通过 `POST /api/rsvp` 写入。

## 本地开发

```bash
cd server
pnpm install --ignore-workspace
cp .env.example .env        # 本地可把 ADMIN_TOKEN 改成任意 ≥16 位串
pnpm dev                    # http://127.0.0.1:3100 ，后台 http://127.0.0.1:3100/admin
```

前端 `pnpm dev`（3300 端口）会把 `/api/*` 自动转发到 3100（见根目录 `next.config.ts`），直接联调。
后端没启动时，前端自动退回本机 localStorage，不影响页面。

## 部署架构

| 域名 | 托管 | 说明 |
|---|---|---|
| `invite.xjj-love-byy.cloud` | 腾讯云服务器（`ssh xinvitation`，OpenCloudOS 9） | nginx 托管静态站 `/var/www/xinvitation`，`/api/*`、`/admin` 反代到本服务 127.0.0.1:3100 |
| `xjj-love-byy.cloud` | EdgeOne（推送 GitHub 自动构建） | 页面跨域调用 `https://invite.xjj-love-byy.cloud/api/*`（前端 `siteConfig.apiOrigin`） |

两个域名的访问、点亮、祝福、微信签名都汇总到这一台服务器，AppSecret 只放在这里。

| 路径 | 说明 |
|---|---|
| `/opt/invitation-server` | 本服务代码（`deploy.sh` 上传），`.env` 配置，`data/` 数据库与备份 |
| `/usr/local/bin/node` | Node 22（官方二进制，系统源只有 Node 20） |
| `/etc/nginx/conf.d/xinvitation.conf` | nginx 配置，仓库副本 `deploy/nginx-invite.conf` |
| `/etc/systemd/system/invitation-server.service` | 进程守护，仓库副本 `deploy/invitation-server.service` |

HTTPS 证书为 Let's Encrypt，`certbot-renew.timer` 自动续期。

## 日常发布（在本机执行）

```bash
./server/deploy/deploy.sh      # 后端：编译 → 上传 → 安装依赖 → 重启 → 健康检查
./scripts/deploy-web.sh        # 静态站：STATIC_EXPORT 构建 → 上传到 /var/www/xinvitation
git push                       # 主域名：EdgeOne 自动构建
```

## 服务器首次安装（已完成，仅供重装参考）

```bash
# Node 22（国内镜像）
V=v22.23.3
curl -fsSL https://registry.npmmirror.com/-/binary/node/$V/node-$V-linux-x64.tar.xz | tar -xJ -C /opt
ln -sf /opt/node-$V-linux-x64/bin/{node,npm,npx,corepack} /usr/local/bin/

useradd --system --home /opt/invitation-server --shell /sbin/nologin invitation
mkdir -p /opt/invitation-server/data && chown -R invitation:invitation /opt/invitation-server/data

# 本机：./server/deploy/deploy.sh（首次只上传代码并安装依赖）

cd /opt/invitation-server
cp .env.example .env
sed -i "s/^ADMIN_TOKEN=.*/ADMIN_TOKEN=$(openssl rand -hex 24)/" .env
sed -i "s#^CORS_ORIGINS=.*#CORS_ORIGINS=https://xjj-love-byy.cloud,https://www.xjj-love-byy.cloud#" .env
chown root:invitation .env && chmod 640 .env

cp deploy/invitation-server.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now invitation-server

cp /etc/nginx/conf.d/xinvitation.conf /root/xinvitation.conf.bak.$(date +%F)
cp deploy/nginx-invite.conf /etc/nginx/conf.d/xinvitation.conf
nginx -t && systemctl reload nginx

# 每天 03:15 备份数据库（保留 30 份，在 data/backups/）
(crontab -u invitation -l 2>/dev/null; echo "15 3 * * * /opt/invitation-server/deploy/backup.sh") | crontab -u invitation -
```

## 微信分享签名（需在公众号后台配置）

服务端 `/api/wx-signature` 替代原 EdgeOne 上的签名函数，前端两个域名都调用它。启用步骤：

1. 服务器 `/opt/invitation-server/.env` 填 `WX_APPID`、`WX_APPSECRET`，然后 `systemctl restart invitation-server`
2. 公众号后台 → 设置与开发 → 基本配置 → **IP 白名单**：添加 `120.53.143.249`
3. 公众号后台 → 公众号设置 → 功能设置 → **JS 接口安全域名**：添加 `invite.xjj-love-byy.cloud`（`xjj-love-byy.cloud` 如未添加也一起加）。
   校验文件放到 `public/` 后重新发布静态站，确保 `https://invite.xjj-love-byy.cloud/MP_verify_xxx.txt` 能访问
4. 验证：`curl "https://invite.xjj-love-byy.cloud/api/wx-signature?url=https://invite.xjj-love-byy.cloud/"` 返回 `signature`

> 同一 AppID 只能由一处换取 access_token，否则会互相顶掉。EdgeOne 上的 `node-functions/api/wx-signature.js` 已不再被前端调用，
> 请勿在 EdgeOne 配置 `WX_APPSECRET`。

## 日常查看数据

直接用手机或电脑打开 **https://invite.xjj-love-byy.cloud/admin**，输入后台口令（`.env` 里的 `ADMIN_TOKEN`，登录后本机记住 30 天）：

- **概览**：打开次数、宾客数、点亮人数、祝福数、各类点击、每日趋势
- **点亮名单**：谁（宾客 #编号 + 设备型号/系统/微信版本 + IP）在什么时候点亮，支持搜索
- **宾客**：全部到访宾客及其行为
- **祝福留言**：隐藏/恢复（请帖祝福墙即时生效）
- **导出**：点亮名单 / 宾客汇总 / 祝福 / 点击明细 CSV

同一 IP 15 分钟内输错 10 次会被暂时锁定。也可以用命令行：

```bash
T=<ADMIN_TOKEN>
curl -H "Authorization: Bearer $T" https://invite.xjj-love-byy.cloud/api/admin/stats
curl -H "Authorization: Bearer $T" https://invite.xjj-love-byy.cloud/api/admin/export/blessings -o blessings.csv
curl -H "Authorization: Bearer $T" -X PATCH -H "Content-Type: application/json" \
     -d '{"hidden":true}' https://invite.xjj-love-byy.cloud/api/admin/blessings/12      # 隐藏第 12 条
```

CSV 带 BOM，可直接用 Excel 打开。

## 运维

- 日志：`journalctl -u invitation-server -f`
- 重启：`systemctl restart invitation-server`
- 数据：`/opt/invitation-server/data/invitation.db`；备份在 `data/backups/`，建议定期下载到本地
- 证书由 certbot 自动续期：`certbot certificates` 查看到期时间
