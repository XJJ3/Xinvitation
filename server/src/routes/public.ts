import type { FastifyInstance, FastifyRequest } from "fastify"
import { db, touchVisitor } from "../db.js"
import { clean, rejectReason, MAX_LEN } from "../filter.js"

// 前端生成的匿名访客 ID（localStorage 持久化），只用于去重统计
const VID = { type: "string", pattern: "^[A-Za-z0-9_-]{8,64}$" } as const
// 浏览器指纹（前端计算的 24 位十六进制），可选，只作辅助参考
const FP = { type: "string", pattern: "^[0-9a-f]{8,32}$" } as const
// 允许记录的点击事件，白名单防止被刷任意类型
export const EVENT_TYPES = ["visit", "love", "fortune", "blessing", "share", "nav", "music"] as const

const meta = (req: FastifyRequest) => ({
  ip: req.ip,
  ua: String(req.headers["user-agent"] ?? "").slice(0, 300),
})

type Ident = { vid: string; fp?: string }

// 每次有宾客请求都登记/刷新 visitors（首次到访分配宾客编号），返回本次请求的 ip/ua
function visit(req: FastifyRequest, who: Ident, now: number) {
  const m = meta(req)
  touchVisitor({ ...who, ...m }, now)
  return m
}

const stmt = {
  insertEvent: db.prepare("INSERT INTO events (type, vid, ip, ua, ref, created_at) VALUES (?, ?, ?, ?, ?, ?)"),
  loveClickCount: db.prepare("SELECT COUNT(*) AS n FROM events WHERE type = 'love'"),
  hasLight: db.prepare("SELECT 1 AS x FROM lights WHERE vid = ?"),
  insertLight: db.prepare("INSERT OR IGNORE INTO lights (vid, created_at) VALUES (?, ?)"),
  updateRsvp: db.prepare("UPDATE visitors SET name = ?, attending = ?, guests = ?, last_at = ? WHERE vid = ?"),
  listBlessings: db.prepare(
    "SELECT id, content, created_at AS createdAt FROM blessings WHERE hidden = 0 ORDER BY id DESC LIMIT ?",
  ),
  countBlessings: db.prepare("SELECT COUNT(*) AS n FROM blessings WHERE hidden = 0"),
  insertBlessing: db.prepare(
    "INSERT INTO blessings (vid, content, ip, ua, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id, content, created_at AS createdAt",
  ),
}

const loveState = (vid?: string) => ({
  // 计数 = 累计点击次数（每次点击记一条 love 事件）；点亮人数见管理接口的 lights 表
  count: Number(stmt.loveClickCount.get()?.n ?? 0),
  lit: vid ? Boolean(stmt.hasLight.get(vid)) : false,
})

export async function publicRoutes(app: FastifyInstance) {
  app.get("/api/health", async () => ({ ok: true }))

  // 通用点击/访问埋点：一次请求写一行，统计在管理接口里做
  app.post<{ Body: Ident & { type: (typeof EVENT_TYPES)[number]; ref?: string } }>("/api/track", {
    schema: {
      body: {
        type: "object",
        required: ["vid", "type"],
        properties: { vid: VID, fp: FP, type: { type: "string", enum: EVENT_TYPES }, ref: { type: "string", maxLength: 300 } },
      },
    },
  }, async (req, reply) => {
    const now = Date.now()
    const { ip, ua } = visit(req, req.body, now)
    stmt.insertEvent.run(req.body.type, req.body.vid, ip, ua, req.body.ref ?? null, now)
    return reply.code(204).send()
  })

  app.get<{ Querystring: { vid?: string } }>("/api/love", {
    schema: { querystring: { type: "object", properties: { vid: VID } } },
  }, async req => loveState(req.query.vid))

  // 点亮：每个访客只算一次；重复点击仍记一次 love 事件，作为「点击量」
  app.post<{ Body: Ident }>("/api/love", {
    schema: { body: { type: "object", required: ["vid"], properties: { vid: VID, fp: FP } } },
  }, async req => {
    const { vid } = req.body
    const now = Date.now()
    const { ip, ua } = visit(req, req.body, now)
    stmt.insertLight.run(vid, now)
    stmt.insertEvent.run("love", vid, ip, ua, null, now)
    return loveState(vid)
  })

  app.get<{ Querystring: { limit?: number } }>("/api/blessings", {
    schema: { querystring: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 200, default: 100 } } } },
  }, async req => ({
    total: Number(stmt.countBlessings.get()?.n ?? 0),
    items: stmt.listBlessings.all(req.query.limit ?? 100),
  }))

  app.post<{ Body: Ident & { content: string } }>("/api/blessings", {
    config: { rateLimit: { max: 6, timeWindow: "1 minute" } },
    schema: {
      body: {
        type: "object",
        required: ["vid", "content"],
        properties: { vid: VID, fp: FP, content: { type: "string", maxLength: MAX_LEN * 4 } },
      },
    },
  }, async (req, reply) => {
    const content = clean(req.body.content)
    const reason = rejectReason(content)
    if (reason) return reply.code(400).send({ error: reason })
    const now = Date.now()
    const { ip, ua } = visit(req, req.body, now)
    const item = stmt.insertBlessing.get(req.body.vid, content, ip, ua, now)
    return reply.code(201).send({ item })
  })

  const NAME_MAX = 20

  // 赴约回执：把姓名/出席状态/出席人数绑定到宾客
  app.post<{ Body: Ident & { name: string; attending: boolean; guests?: number } }>("/api/rsvp", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    schema: {
      body: {
        type: "object",
        required: ["vid", "name", "attending"],
        properties: {
          vid: VID,
          fp: FP,
          name: { type: "string", maxLength: 100 },
          attending: { type: "boolean" },
          guests: { type: "integer", minimum: 1, maximum: 20, default: 1 },
        },
      },
    },
  }, async (req, reply) => {
    const name = clean(req.body.name)
    if (!name) return reply.code(400).send({ error: "请填写您的姓名" })
    if ([...name].length > NAME_MAX) return reply.code(400).send({ error: "姓名过长" })
    const now = Date.now()
    visit(req, req.body, now)
    stmt.updateRsvp.run(name, req.body.attending ? 1 : 0, req.body.guests ?? 1, now, req.body.vid)
    stmt.insertEvent.run("rsvp", req.body.vid, req.ip, String(req.headers["user-agent"] ?? "").slice(0, 300), null, now)
    return { ok: true, name, attending: req.body.attending, guests: req.body.guests ?? 1 }
  })
}
