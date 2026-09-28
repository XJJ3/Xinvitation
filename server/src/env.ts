// 运行配置：全部来自环境变量（.env 由 node --env-file 加载）
function list(v: string | undefined): string[] {
  return (v ?? "").split(",").map(s => s.trim()).filter(Boolean)
}

export const env = {
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT) || 3100,
  dbPath: process.env.DB_PATH || "./data/invitation.db",
  adminToken: process.env.ADMIN_TOKEN || "",
  corsOrigins: list(process.env.CORS_ORIGINS),
  blockWords: list(process.env.BLOCK_WORDS),
  wxAppId: process.env.WX_APPID || "",
  wxAppSecret: process.env.WX_APPSECRET || "",
  // 允许签名的页面域名（含其子域），防止接口被当成任意网址的签名服务
  wxSignDomains: list(process.env.WX_SIGN_DOMAINS || "xjj-love-byy.cloud"),
}

// 未配置或仍是示例值时，管理接口一律拒绝，避免裸奔
export const adminEnabled = env.adminToken.length >= 16 && env.adminToken !== "change-me"
