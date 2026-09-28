// 请帖后端（server/）客户端封装：访问/点击埋点、点亮计数、祝福墙
// 接口地址：见 apiBase()（NEXT_PUBLIC_API_BASE > 同源 > siteConfig.apiOrigin）
// 任何请求失败都只返回 null，由调用方退回本机 localStorage 行为，绝不打断页面交互

import { ident } from "./guestId"
import { siteConfig } from "@/config/site"

// 优先用构建时注入的 NEXT_PUBLIC_API_BASE；否则：本地开发与 apiOrigin 自身同源调用，其他域名跨域调用 apiOrigin
function apiBase(): string {
  const env = process.env.NEXT_PUBLIC_API_BASE
  if (env !== undefined && env !== "") return env.replace(/\/$/, "")
  if (typeof location === "undefined") return ""
  const { hostname, origin } = location
  if (hostname === "localhost" || hostname === "127.0.0.1" || origin === siteConfig.apiOrigin) return ""
  return siteConfig.apiOrigin
}

let API_BASE: string | null = null

export type TrackType = "visit" | "love" | "fortune" | "blessing" | "share" | "nav" | "music"
export type Blessing = { id: number; content: string; createdAt: number }
export type LoveState = { count: number; lit: boolean }

async function request<T>(path: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error?: string }> {
  try {
    API_BASE ??= apiBase()
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    })
    if (res.status === 204) return { ok: true, data: undefined as T }
    const data = await res.json().catch(() => null)
    // 只有 4xx 才是「服务端明确拒绝」（带给用户看的 error）；5xx/网关错误按不可用处理，走本机降级
    if (!res.ok) return { ok: false, error: res.status < 500 && typeof data?.error === "string" ? data.error : undefined }
    return { ok: true, data: data as T }
  } catch {
    return { ok: false }
  }
}

const post = (path: string, body: unknown) =>
  request(path, { method: "POST", body: JSON.stringify(body) })

export function track(type: TrackType, ref?: string): void {
  void post("/api/track", { ...ident(), type, ...(ref ? { ref: ref.slice(0, 300) } : {}) })
}

export async function fetchLove(): Promise<LoveState | null> {
  const r = await request<LoveState>(`/api/love?vid=${ident().vid}`)
  return r.ok ? r.data : null
}

export async function sendLove(): Promise<LoveState | null> {
  const r = await request<LoveState>("/api/love", { method: "POST", body: JSON.stringify(ident()) })
  return r.ok ? r.data : null
}

export async function fetchBlessings(): Promise<Blessing[] | null> {
  const r = await request<{ total: number; items: Blessing[] }>("/api/blessings?limit=100")
  return r.ok ? r.data.items : null
}

// 返回：成功 → { item }；服务端拒绝（如敏感词）→ { error }；网络/服务不可用 → null
export async function sendBlessing(content: string): Promise<{ item: Blessing } | { error: string } | null> {
  const r = await request<{ item: Blessing }>("/api/blessings", {
    method: "POST",
    body: JSON.stringify({ ...ident(), content }),
  })
  if (r.ok) return r.data
  return r.error ? { error: r.error } : null
}

// 提交出席回复：姓名按当前浏览器 vid 落库，服务端据此把该访客此前的祝福/点击归到名下
// 返回：成功 → { ok: true }；服务端拒绝 → { error }；网络/服务不可用 → null（调用方静默忽略）
export async function sendRsvp(name: string, attending: boolean, guests: number): Promise<{ ok: true } | { error: string } | null> {
  const r = await request<{ ok: true }>("/api/rsvp", {
    method: "POST",
    body: JSON.stringify({ ...ident(), name, attending, guests }),
  })
  if (r.ok) return { ok: true }
  return r.error ? { error: r.error } : null
}

export type WxSignature = { appId: string; timestamp: string; nonceStr: string; signature: string }

// 微信 JS-SDK 签名（服务端持有 AppSecret；invite 域名同源，其他域名跨域到同一后端）
export async function fetchWxSignature(pageUrl: string): Promise<WxSignature | { error: string }> {
  const r = await request<WxSignature>(`/api/wx-signature?url=${encodeURIComponent(pageUrl)}`)
  return r.ok ? r.data : { error: r.error ?? "签名服务不可用" }
}
