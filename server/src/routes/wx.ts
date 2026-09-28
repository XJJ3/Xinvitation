import { createHash, randomBytes } from "node:crypto"
import type { FastifyInstance } from "fastify"
import { env } from "../env.js"

// 微信 JS-SDK 签名：AppID/AppSecret → access_token → jsapi_ticket → sha1
// access_token / jsapi_ticket 有效期 7200 秒且每日调用次数有限，必须缓存；单进程部署，内存缓存即可
// 注意：同一 AppID 只能有一处在换 access_token，否则新旧 token 互相顶掉

type Cached = { value: string; expireAt: number }
const SAFETY_MS = 5 * 60 * 1000
let token: Cached | null = null
let ticket: Cached | null = null
let inflight: Promise<string> | null = null

const fresh = (c: Cached | null) => (c && Date.now() < c.expireAt ? c.value : null)
const until = (expiresIn: number | undefined) => Date.now() + (expiresIn || 7200) * 1000 - SAFETY_MS

async function getJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  return (await res.json()) as Record<string, unknown>
}

async function fetchTicket(): Promise<string> {
  let accessToken = fresh(token)
  if (!accessToken) {
    const t = await getJson(
      `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${env.wxAppId}&secret=${env.wxAppSecret}`,
    )
    if (typeof t.access_token !== "string") throw new Error(`获取 access_token 失败：${t.errcode} ${t.errmsg}`)
    accessToken = t.access_token
    token = { value: accessToken, expireAt: until(t.expires_in as number) }
  }
  const j = await getJson(`https://api.weixin.qq.com/cgi-bin/ticket/getticket?access_token=${accessToken}&type=jsapi`)
  if (j.errcode !== 0 || typeof j.ticket !== "string") {
    // token 被别处刷新导致失效（40001/42001）时丢弃缓存，下次重新获取
    if (j.errcode === 40001 || j.errcode === 42001) token = null
    throw new Error(`获取 jsapi_ticket 失败：${j.errcode} ${j.errmsg}`)
  }
  ticket = { value: j.ticket, expireAt: until(j.expires_in as number) }
  return j.ticket
}

// 并发请求共用同一次刷新，避免同时打多次微信接口
async function getTicket(): Promise<string> {
  const cached = fresh(ticket)
  if (cached) return cached
  inflight ??= fetchTicket().finally(() => { inflight = null })
  return inflight
}

export function sign(jsapiTicket: string, nonceStr: string, timestamp: string, url: string): string {
  // 四个字段按字段名 ASCII 升序拼接后 sha1（微信官方算法）
  const raw = `jsapi_ticket=${jsapiTicket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${url}`
  return createHash("sha1").update(raw, "utf8").digest("hex")
}

function allowedUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    if (u.protocol !== "https:" && u.protocol !== "http:") return false
    return env.wxSignDomains.some(d => u.hostname === d || u.hostname.endsWith(`.${d}`))
  } catch {
    return false
  }
}

export async function wxRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { url: string } }>("/api/wx-signature", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    schema: {
      querystring: {
        type: "object",
        required: ["url"],
        properties: { url: { type: "string", minLength: 8, maxLength: 1000 } },
      },
    },
  }, async (req, reply) => {
    reply.header("Cache-Control", "no-store")
    if (!env.wxAppId || !env.wxAppSecret) return reply.code(503).send({ error: "服务端未配置 WX_APPID / WX_APPSECRET" })
    const url = req.query.url.split("#")[0]
    if (!allowedUrl(url)) return reply.code(400).send({ error: "不允许为该页面签名" })
    try {
      const jsapiTicket = await getTicket()
      const nonceStr = randomBytes(8).toString("hex")
      const timestamp = String(Math.floor(Date.now() / 1000))
      return { appId: env.wxAppId, timestamp, nonceStr, signature: sign(jsapiTicket, nonceStr, timestamp, url) }
    } catch (err) {
      req.log.error(err)
      return reply.code(502).send({ error: "微信签名暂时不可用" })
    }
  })
}
