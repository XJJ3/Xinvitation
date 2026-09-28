// 宾客标识
// - vid：宾客 ID。首次访问随机生成（128 位，全局唯一），同时存 localStorage 与 cookie，
//        任一处被清掉都能从另一处恢复。作为统计主键，保证不同宾客绝不会被合并。
// - fp ：浏览器指纹。由设备/浏览器特征计算，清缓存后不变，只作辅助参考：
//        同型号 iPhone + 同版本微信的指纹几乎相同，不能当主键，否则会把不同宾客算成一个人。
// 两者都不含姓名、手机号等身份信息。

const VID_KEY = "inv-vid"
const VID_COOKIE = "inv_vid"
const VID_RE = /^[A-Za-z0-9_-]{8,64}$/

function randomId(): string {
  const bytes = new Uint8Array(16)
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("")
}

function readCookie(): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${VID_COOKIE}=([^;]*)`))
  return m ? decodeURIComponent(m[1]) : null
}

function writeCookie(id: string) {
  const secure = location.protocol === "https:" ? "; Secure" : ""
  document.cookie = `${VID_COOKIE}=${id}; Max-Age=${60 * 60 * 24 * 400}; Path=/; SameSite=Lax${secure}`
}

let vidCache: string | null = null

export function getVid(): string {
  if (vidCache) return vidCache
  let id: string | null = null
  try { id = localStorage.getItem(VID_KEY) } catch {}
  if (!id || !VID_RE.test(id)) id = readCookie()
  if (!id || !VID_RE.test(id)) id = randomId()
  try { localStorage.setItem(VID_KEY, id) } catch {}
  try { writeCookie(id) } catch {}
  vidCache = id
  return id
}

// cyrb53：快速 53 位字符串哈希（非加密用途），两路种子拼接后取 24 位十六进制
function cyrb53(str: string, seed: number): string {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0")
}

// Canvas 渲染差异（字体栅格化/抗锯齿因 GPU、系统而异）
function canvasSignal(): string {
  try {
    const c = document.createElement("canvas")
    c.width = 240; c.height = 60
    const g = c.getContext("2d")
    if (!g) return ""
    g.textBaseline = "top"
    g.font = "16px 'PingFang SC','Microsoft YaHei',sans-serif"
    g.fillStyle = "#f60"; g.fillRect(100, 1, 62, 20)
    g.fillStyle = "#069"; g.fillText("囍 Wedding 2026 ♡", 2, 15)
    g.fillStyle = "rgba(102,204,0,0.7)"; g.fillText("囍 Wedding 2026 ♡", 4, 17)
    return c.toDataURL()
  } catch { return "" }
}

function webglSignal(): string {
  try {
    const gl = document.createElement("canvas").getContext("webgl") as WebGLRenderingContext | null
    if (!gl) return ""
    const ext = gl.getExtension("WEBGL_debug_renderer_info")
    const vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)
    const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
    return `${vendor}|${renderer}|${gl.getParameter(gl.MAX_TEXTURE_SIZE)}`
  } catch { return "" }
}

let fpCache: string | null = null

export function getFingerprint(): string {
  if (fpCache) return fpCache
  const n = navigator as Navigator & { deviceMemory?: number }
  const parts = [
    n.userAgent,
    n.language,
    (n.languages ?? []).join(","),
    n.platform,
    n.hardwareConcurrency,
    n.deviceMemory,
    n.maxTouchPoints,
    screen.width, screen.height, screen.colorDepth, window.devicePixelRatio,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    webglSignal(),
    canvasSignal(),
  ].join("~")
  fpCache = (cyrb53(parts, 0) + cyrb53(parts, 1)).slice(0, 24)
  return fpCache
}

export const ident = () => ({ vid: getVid(), fp: getFingerprint() })
