import Fastify, { type FastifyError } from "fastify"
import cors from "@fastify/cors"
import rateLimit from "@fastify/rate-limit"
import { env, adminEnabled } from "./env.js"
import { db } from "./db.js"
import { publicRoutes } from "./routes/public.js"
import { adminRoutes } from "./routes/admin.js"
import { adminPage } from "./routes/page.js"
import { wxRoutes } from "./routes/wx.js"

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL || "info" },
  // 部署在 nginx 后面，req.ip 取 X-Forwarded-For 中的真实客户端地址
  trustProxy: true,
  bodyLimit: 8 * 1024,
})

if (env.corsOrigins.length) {
  await app.register(cors, { origin: env.corsOrigins, methods: ["GET", "POST"] })
}
await app.register(rateLimit, { max: 120, timeWindow: "1 minute" })

// 所有框架/插件抛出的错误统一成 { error: 中文 }：error 字段会原样显示在页面提示里
function errorText(status: number): string {
  if (status === 429) return "发送太频繁啦，歇一会儿再试"
  if (status === 404) return "接口不存在"
  if (status >= 500) return "服务暂时不可用"
  return "请求格式不正确"
}

app.setErrorHandler<FastifyError>((err, req, reply) => {
  const status = err.validation ? 400 : err.statusCode ?? 500
  if (status >= 500) req.log.error(err)
  return reply.code(status).send({ error: errorText(status) })
})
app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: errorText(404) }))

await app.register(publicRoutes)
await app.register(adminRoutes)
await app.register(adminPage)
await app.register(wxRoutes)

const shutdown = async () => {
  await app.close()
  db.close()
  process.exit(0)
}
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)

await app.listen({ host: env.host, port: env.port })
if (!adminEnabled) app.log.warn("ADMIN_TOKEN 未配置（或少于 16 位），管理接口已禁用")
