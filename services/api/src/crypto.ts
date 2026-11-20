import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const hmac = (secret: string, s: string) => createHmac("sha256", secret).update(s).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const randomOtp = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
export function safeEqualHex(a: string, b: string) {
  const ba = Buffer.from(a, "hex"), bb = Buffer.from(b, "hex");
  return ba.length === bb.length && ba.length > 0 && timingSafeEqual(ba, bb);
}
/** Token XMPP: "<exp>.<hmac_sha256(secret, localpart.exp)>" — kiểm tra bởi infra/prosody/plugins/mod_auth_appsvc.lua */
export function xmppToken(secret: string, localpart: string, expUnix: number) {
  return `${expUnix}.${hmac(secret, `${localpart}.${expUnix}`)}`;
}
/** Mã mời dễ đọc: 12 ký tự (bỏ 0/O/1/I), nhóm 4. */
export function inviteCode() {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let s = "";
  for (let i = 0; i < 12; i++) s += alphabet[randomInt(0, alphabet.length)];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}
export const normalizeInviteCode = (c: string) => c.toUpperCase().replace(/[^0-9A-Z]/g, "");
