import { env } from "./env.js"

// 基础屏蔽词：只挡最常见的广告/引流，其余靠管理接口事后隐藏
const BASE_WORDS = ["加微信", "加v", "vx", "薇信", "代理", "兼职", "刷单", "博彩", "赌博", "贷款", "色情", "约炮"]
const words = [...BASE_WORDS, ...env.blockWords].map(w => w.toLowerCase())

// 网址、QQ 号/手机号这类长数字串：祝福里不会出现，出现基本是引流
const LINK_RE = /(https?:\/\/|www\.|\.(com|cn|net|top|xyz)\b|\d{7,})/i

export const MAX_LEN = 40

// 去掉控制字符与零宽字符，合并空白
export function clean(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202f\u2060\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

export function rejectReason(text: string): string | null {
  if (!text) return "祝福不能为空"
  if ([...text].length > MAX_LEN) return `祝福最多 ${MAX_LEN} 个字`
  const lower = text.toLowerCase()
  if (LINK_RE.test(text) || words.some(w => lower.includes(w))) return "这句祝福暂时发不出去，换一句试试"
  return null
}
