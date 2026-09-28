import { timingSafeEqual } from "node:crypto"
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import { db } from "../db.js"
import { env, adminEnabled } from "../env.js"

// 常量时间比较，避免按响应时间逐字符猜口令。
// 前端对口令做 encodeURIComponent（请求头不能直接放中文），这里解码后再比较
function tokenOk(header: string | undefined): boolean {
  let raw = header?.replace(/^Bearer\s+/i, "") ?? ""
  try { raw = decodeURIComponent(raw) } catch { return false }
  const got = Buffer.from(raw)
  const want = Buffer.from(env.adminToken)
  return got.length === want.length && timingSafeEqual(got, want)
}

// 口令允许很短，所以按 IP 限制猜测次数：15 分钟内错 10 次即锁定到窗口结束
const FAIL_LIMIT = 10
const FAIL_WINDOW_MS = 15 * 60 * 1000
const fails = new Map<string, { n: number; resetAt: number }>()

async function guard(req: FastifyRequest, reply: FastifyReply) {
  if (!adminEnabled) return reply.code(503).send({ error: "未配置后台口令 ADMIN_TOKEN" })
  const now = Date.now()
  const rec = fails.get(req.ip)
  if (rec && now > rec.resetAt) fails.delete(req.ip)
  const cur = fails.get(req.ip)
  if (cur && cur.n >= FAIL_LIMIT) {
    const min = Math.ceil((cur.resetAt - now) / 60000)
    return reply.code(429).send({ error: `口令错误次数过多，请 ${min} 分钟后再试` })
  }
  if (!tokenOk(req.headers.authorization)) {
    const next = cur ?? { n: 0, resetAt: now + FAIL_WINDOW_MS }
    next.n += 1
    fails.set(req.ip, next)
    if (fails.size > 10000) fails.clear()
    return reply.code(401).send({ error: "口令不正确" })
  }
  fails.delete(req.ip)
}

// 按北京时间分天
const DAY = "strftime('%Y-%m-%d', created_at / 1000, 'unixepoch', '+8 hours')"

const T = (col: string) => `datetime(${col} / 1000, 'unixepoch', '+8 hours')`

// 每位宾客的行为汇总；same_fp = 与其指纹相同的宾客数（>1 说明可能是同一人换了浏览器/清了缓存，也可能只是同款手机）
const VISITOR_SQL = `
  SELECT v.no, v.vid, v.fp, v.ip, v.ua, v.first_at AS firstAt, v.last_at AS lastAt,
         l.created_at AS litAt,
         (SELECT COUNT(*) FROM events e WHERE e.vid = v.vid AND e.type = 'visit') AS visits,
         (SELECT COUNT(*) FROM events e WHERE e.vid = v.vid AND e.type = 'love')  AS loveClicks,
         (SELECT COUNT(*) FROM blessings b WHERE b.vid = v.vid)                   AS blessings,
         (SELECT COUNT(*) FROM visitors v2 WHERE v2.fp = v.fp)                    AS sameFp
  FROM visitors v LEFT JOIN lights l ON l.vid = v.vid`

const EXPORTS = {
  lights: `SELECT v.no AS guest_no, l.vid, v.fp, v.ip, v.ua, ${T("l.created_at")} AS lit_time,
             (SELECT COUNT(*) FROM events e WHERE e.vid = l.vid AND e.type = 'love') AS love_clicks
           FROM lights l LEFT JOIN visitors v ON v.vid = l.vid ORDER BY l.created_at`,
  blessings: `SELECT b.id, v.no AS guest_no, b.content, b.hidden, b.vid, b.ip, b.ua, ${T("b.created_at")} AS time
              FROM blessings b LEFT JOIN visitors v ON v.vid = b.vid ORDER BY b.id`,
  events: `SELECT e.id, v.no AS guest_no, e.type, e.vid, e.ip, e.ua, e.ref, ${T("e.created_at")} AS time
           FROM events e LEFT JOIN visitors v ON v.vid = e.vid ORDER BY e.id`,
  visitors: `SELECT no AS guest_no, vid, fp, ip, ua, visits, loveClicks AS love_clicks, blessings,
               CASE WHEN litAt IS NULL THEN '' ELSE ${T("litAt")} END AS lit_time,
               ${T("firstAt")} AS first_time, ${T("lastAt")} AS last_time
             FROM (${VISITOR_SQL}) ORDER BY no`,
} as const

// 前缀 = + - @ 的单元格会被 Excel 当公式执行，加单引号转义
function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v)
  if (/^[=+\-@]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ""
  const cols = Object.keys(rows[0])
  return [cols.join(","), ...rows.map(r => cols.map(c => csvCell(r[c])).join(","))].join("\r\n")
}

export async function adminRoutes(app: FastifyInstance) {
  app.addHook("onRequest", guard)

  app.get("/api/admin/stats", async () => {
    const one = (sql: string) => Number((db.prepare(sql).get() as { n: number } | undefined)?.n ?? 0)
    return {
      pv: one("SELECT COUNT(*) AS n FROM events WHERE type = 'visit'"),
      uv: one("SELECT COUNT(*) AS n FROM visitors"),
      fingerprints: one("SELECT COUNT(DISTINCT fp) AS n FROM visitors WHERE fp IS NOT NULL"),
      lights: one("SELECT COUNT(*) AS n FROM lights"),
      blessings: one("SELECT COUNT(*) AS n FROM blessings"),
      hiddenBlessings: one("SELECT COUNT(*) AS n FROM blessings WHERE hidden = 1"),
      clicks: db.prepare("SELECT type, COUNT(*) AS n, COUNT(DISTINCT vid) AS visitors FROM events GROUP BY type ORDER BY n DESC").all(),
      daily: db.prepare(
        `SELECT ${DAY} AS day, SUM(type = 'visit') AS pv, COUNT(DISTINCT CASE WHEN type = 'visit' THEN vid END) AS uv, COUNT(*) AS events
         FROM events GROUP BY day ORDER BY day DESC LIMIT 60`,
      ).all(),
    }
  })

  // 点亮名单：谁（宾客编号/ID/指纹/设备）在什么时候点亮，以及他的其他行为
  app.get("/api/admin/lights", async () =>
    db.prepare(`SELECT * FROM (${VISITOR_SQL}) WHERE litAt IS NOT NULL ORDER BY litAt DESC`).all(),
  )

  app.get("/api/admin/visitors", async () =>
    db.prepare(`SELECT * FROM (${VISITOR_SQL}) ORDER BY no DESC`).all(),
  )

  app.get("/api/admin/blessings", async () =>
    db.prepare(
      `SELECT b.id, b.content, b.hidden, b.vid, v.no, b.ip, b.ua, b.created_at AS createdAt
       FROM blessings b LEFT JOIN visitors v ON v.vid = b.vid ORDER BY b.id DESC`,
    ).all(),
  )

  // 隐藏/恢复某条祝福（不物理删除，便于误操作找回）
  app.patch<{ Params: { id: number }; Body: { hidden: boolean } }>("/api/admin/blessings/:id", {
    schema: {
      params: { type: "object", properties: { id: { type: "integer" } } },
      body: { type: "object", required: ["hidden"], properties: { hidden: { type: "boolean" } } },
    },
  }, async (req, reply) => {
    const r = db.prepare("UPDATE blessings SET hidden = ? WHERE id = ?").run(req.body.hidden ? 1 : 0, req.params.id)
    if (!r.changes) return reply.code(404).send({ error: "not found" })
    return { id: req.params.id, hidden: req.body.hidden }
  })

  app.get<{ Params: { kind: keyof typeof EXPORTS } }>("/api/admin/export/:kind", {
    schema: { params: { type: "object", properties: { kind: { type: "string", enum: Object.keys(EXPORTS) } } } },
  }, async (req, reply) => {
    const rows = db.prepare(EXPORTS[req.params.kind]).all() as Record<string, unknown>[]
    const date = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10)
    return reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="${req.params.kind}-${date}.csv"`)
      // BOM 让 Excel 按 UTF-8 打开中文不乱码
      .send("\ufeff" + toCsv(rows))
  })
}
