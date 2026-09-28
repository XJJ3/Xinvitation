import { randomBytes } from "node:crypto"
import { readFileSync } from "node:fs"
import type { FastifyInstance } from "fastify"

// dist/routes/page.js → ../../public/admin.html（开发时 src/routes 同理）
const HTML = readFileSync(new URL("../../public/admin.html", import.meta.url), "utf8")

// 后台网页本身不含任何数据，数据都要带令牌调 /api/admin/*；
// 每次响应生成 nonce，CSP 只放行这一段内联脚本，禁止外链与被 iframe 嵌入
export async function adminPage(app: FastifyInstance) {
  app.get("/admin", async (_req, reply) => {
    const nonce = randomBytes(16).toString("base64")
    return reply
      .type("text/html; charset=utf-8")
      .header("Cache-Control", "no-store")
      .header("X-Frame-Options", "DENY")
      .header("Referrer-Policy", "no-referrer")
      .header("X-Content-Type-Options", "nosniff")
      .header(
        "Content-Security-Policy",
        `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' blob: data:; form-action 'none'; frame-ancestors 'none'; base-uri 'none'`,
      )
      .send(HTML.replace("<script>", `<script nonce="${nonce}">`))
  })
  app.get("/admin/", async (_req, reply) => reply.redirect("/admin"))
}
