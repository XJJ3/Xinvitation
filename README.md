# 电子订婚请帖

浪漫梦幻的电子订婚请帖单页网站，信封打开动画 + 订婚日期倒计时。

技术栈：Next.js 16 + React 19 + TypeScript + Tailwind CSS v4 + Framer Motion。

---

## 本地预览

```bash
pnpm install
pnpm dev
```

打开 http://localhost:3300 预览。

---

## 修改请帖内容

所有文案集中在一个文件：`src/config/site.ts`

打开它，把【】占位内容替换成你的真实信息：

- 新郎新娘姓名
- 订婚日期时间（改 `eventDate`，倒计时自动以此为目标）
- 微信分享卡片的标题和描述
- 部署后的正式域名（`url`）

---

## 微信分享卡片

本项目已配置 Open Graph 标签，微信会自动抓取生成卡片（带图 + 标题 + 描述）。

### 让微信卡片生效的两个前提
1. **必须是已备案的自有域名**（不能用 `*.vercel.app`）
2. **必须 HTTPS**（Vercel 自动提供）

---

## Vercel 部署

1. **把代码推到 GitHub**
   ```bash
   git add .
   git commit -m "feat: 电子订婚请帖"
   git remote add origin <你的GitHub仓库地址>
   git push -u origin main
   ```

2. **在 Vercel 导入项目**
   - 登录 https://vercel.com → New Project → 选择你的 GitHub 仓库
   - Framework 自动识别为 Next.js，直接 Deploy

3. **绑定自有备案域名（关键，微信卡片必需）**
   - **先买域名并完成 ICP 备案**（阿里云/腾讯云，¥30-70/年，备案约 1-2 周，需身份证+人脸核验）
   - Vercel 项目 → Settings → Domains → 添加你的域名
   - 在域名服务商处添加 CNAME 解析：`cname-china.vercel-dns.com`
   - 等待 DNS 生效

4. **更新配置里的域名**
   - 把 `src/config/site.ts` 里的 `url` 改成你的正式域名
   - 重新部署（push 代码会自动触发）

---

## 上线前检查清单

- [ ] `src/config/site.ts` 所有【】占位内容已替换为真实信息
- [ ] 域名已购买并完成 ICP 备案
- [ ] 域名已绑定到 Vercel 并解析生效
- [ ] 在微信里实测：粘贴链接确认显示成卡片
- [ ] 手机微信打开实测信封动画和倒计时
