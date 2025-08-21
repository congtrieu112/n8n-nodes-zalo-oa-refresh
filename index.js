// oauth-zalo-oa.js
import crypto from "crypto";
import { URLSearchParams } from "url";
import jwt from "jsonwebtoken";

/** 1) Tạo PKCE */
export function createPkce() {
  const code_verifier = crypto.randomBytes(48).toString("base64url"); // ~64 ký tự
  const hash = crypto.createHash("sha256").update(code_verifier).digest();
  const code_challenge = Buffer.from(hash).toString("base64url");
  return { code_verifier, code_challenge };
}

/** 2) Tạo URL cấp quyền (redirect người dùng tới đây) */
export function buildAuthorizeUrl({ appId, redirectUri, codeChallenge, state }) {
  const q = new URLSearchParams({
    app_id: String(appId),
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state: state || crypto.randomUUID(),
  });
  return { url: `https://oauth.zaloapp.com/v4/oa/authorize?${q}`, state: q.get("state") };
}

/** 3) Đổi authorization code -> access_token (PKCE, KHÔNG cần app_secret) */
export async function exchangeCodeForToken({ appId, code, codeVerifier, redirectUri }) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    app_id: String(appId),
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
  });
  const res = await fetch("https://oauth.zaloapp.com/v4/oa/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`exchange failed: ${res.status} ${res.statusText} — ${JSON.stringify(json)}`);
  }
  return json; // { access_token, refresh_token, expires_in, scope, ... }
}

/** 4) Làm mới access_token bằng refresh_token (PKCE) */
export async function refreshAccessToken({ appId, refreshToken }) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    app_id: String(appId),
    refresh_token: refreshToken,
  });
  const res = await fetch("https://oauth.zaloapp.com/v4/oa/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`refresh failed: ${res.status} ${res.statusText} — ${JSON.stringify(json)}`);
  }
  return json; // { access_token, refresh_token, expires_in, ... }
}

/** 5) (Tuỳ chọn) Gửi ZNS template — dùng để gửi OTP */
export async function sendZnsTemplate({ accessToken, phoneE164, templateId, templateData, trackingId }) {
  const res = await fetch("https://business.openapi.zalo.me/message/template", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "access_token": accessToken,
    },
    body: JSON.stringify({
      phone: phoneE164,           // ví dụ: "8490xxxxxxxx"
      template_id: templateId,    // ID template ZNS đã duyệt (loại OTP)
      template_data: templateData, // { name, otp, expire, ... } khớp params của template
      tracking_id: trackingId || `zns_${Date.now()}`,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`ZNS send failed: ${res.status} ${res.statusText} — ${JSON.stringify(json)}`);
  return json;
}

const {code_challenge, code_verifier} = createPkce()
const appId = "542781883740775517"
const redirectUri = "https://8secon.com/zalo"
const url = buildAuthorizeUrl({appId, redirectUri, codeChallenge: code_challenge, state: code_verifier})
console.log({url})


const payload = { userId: 283, role: "admin" }; // payload API yêu cầu
const secret = "7N#5L*oLUrFrLCsm";       // giống như điền vào Secret
const token = jwt.sign(payload, secret, { algorithm: "HS256", expiresIn: "1y" }); // 1 year

console.log({token});
