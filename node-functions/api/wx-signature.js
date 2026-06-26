/**
 * 微信 JS-SDK 签名接口（EdgeOne Pages Node Function）
 *
 * 路由：GET /api/wx-signature?url=<当前页面完整URL>
 * 返回：{ appId, timestamp, nonceStr, signature }
 *
 * 流程：AppID/AppSecret -> access_token -> jsapi_ticket -> sha1(string1) -> signature
 * access_token / jsapi_ticket 均有 7200 秒有效期且调用次数受限，
 * 因此用 EdgeOne Pages KV 缓存，并在 value 里自带过期时间戳（KV 无显式 TTL）。
 *
 * 需要在 EdgeOne 控制台配置：
 *   - 环境变量：WX_APPID、WX_APPSECRET（服务号的 AppID / AppSecret）
 *   - KV 命名空间：绑定为运行时变量名 wx_kv
 *   - 函数出口 IP 须加入公众号后台「IP 白名单」
 */

import crypto from "node:crypto";

// 缓存键
const TOKEN_KEY = "wx_access_token";
const TICKET_KEY = "wx_jsapi_ticket";
// 提前 5 分钟过期，留出时钟与网络余量
const SAFETY_MS = 5 * 60 * 1000;

// 从 KV 读取「带过期时间戳」的缓存值，过期则返回 null
async function getCached(kv, key) {
  if (!kv) return null;
  const raw = await kv.get(key, "json");
  if (raw && raw.value && raw.expireAt && Date.now() < raw.expireAt) {
    return raw.value;
  }
  return null;
}

// 写入 KV，记录到期时间（微信 expires_in 单位为秒）
async function setCached(kv, key, value, expiresInSec) {
  if (!kv) return;
  const expireAt = Date.now() + expiresInSec * 1000 - SAFETY_MS;
  await kv.put(key, JSON.stringify({ value, expireAt }));
}

async function getAccessToken(env, kv) {
  const cached = await getCached(kv, TOKEN_KEY);
  if (cached) return cached;

  const appId = env.WX_APPID;
  const appSecret = env.WX_APPSECRET;
  const api = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`;
  const res = await fetch(api);
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`获取 access_token 失败：${JSON.stringify(data)}`);
  }
  await setCached(kv, TOKEN_KEY, data.access_token, data.expires_in || 7200);
  return data.access_token;
}

async function getJsapiTicket(env, kv) {
  const cached = await getCached(kv, TICKET_KEY);
  if (cached) return cached;

  const token = await getAccessToken(env, kv);
  const api = `https://api.weixin.qq.com/cgi-bin/ticket/getticket?access_token=${token}&type=jsapi`;
  const res = await fetch(api);
  const data = await res.json();
  if (data.errcode !== 0 || !data.ticket) {
    throw new Error(`获取 jsapi_ticket 失败：${JSON.stringify(data)}`);
  }
  await setCached(kv, TICKET_KEY, data.ticket, data.expires_in || 7200);
  return data.ticket;
}

function sha1(str) {
  return crypto.createHash("sha1").update(str, "utf8").digest("hex");
}

function randomStr() {
  return crypto.randomBytes(16).toString("hex");
}

export async function onRequestGet(context) {
  const { request, env } = context;
  // KV 命名空间在控制台绑定为运行时变量名 wx_kv（全局可用）
  const kv = typeof wx_kv !== "undefined" ? wx_kv : env.wx_kv;

  const reqUrl = new URL(request.url);
  // 待签名的页面 URL：由前端把 location.href.split('#')[0] 传来
  const pageUrl = reqUrl.searchParams.get("url");

  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        // 仅允许本站调用
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      },
    });

  if (!pageUrl) {
    return json({ error: "缺少 url 参数" }, 400);
  }
  if (!env.WX_APPID || !env.WX_APPSECRET) {
    return json({ error: "服务端未配置 WX_APPID / WX_APPSECRET" }, 500);
  }

  try {
    const ticket = await getJsapiTicket(env, kv);
    const noncestr = randomStr();
    const timestamp = String(Math.floor(Date.now() / 1000));

    // 微信签名：四个字段按字段名 ASCII 字典序拼接（jsapi_ticket、noncestr、timestamp、url），再 sha1
    const string1 = `jsapi_ticket=${ticket}&noncestr=${noncestr}&timestamp=${timestamp}&url=${pageUrl}`;
    const signature = sha1(string1);

    return json({
      appId: env.WX_APPID,
      timestamp,
      nonceStr: noncestr,
      signature,
    });
  } catch (err) {
    return json({ error: String(err && err.message ? err.message : err) }, 500);
  }
}
