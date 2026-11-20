// Lõi phiên chat — chạy trong main process của Electron hoặc trong Node (test). Không phụ thuộc DOM/Electron.
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { client as xmppClient, xml } from "@xmpp/client";
import { Xmlns } from "@yc/contracts";
import { jidToUserId, presenceMode, presenceForMode, MessageStore, assertSecureEndpoint } from "./model.js";

const STANZAS = "urn:ietf:params:xml:ns:xmpp-stanzas";

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message ?? `HTTP ${status}`);
    this.status = status; this.code = body?.error?.code ?? "HTTP_" + status; this.retryAfterSec = body?.error?.retryAfterSec;
  }
}

export class ChatCore extends EventEmitter {
  constructor({ apiBase, ttlDays = 30, now = () => Date.now(), fetchImpl = globalThis.fetch, insecureTls = false } = {}) {
    super();
    assertSecureEndpoint(apiBase, insecureTls);
    this.apiBase = apiBase.replace(/\/$/, "");
    this.now = now; this.fetch = fetchImpl; this.insecureTls = insecureTls;
    this.token = null; this.me = null;
    this.mode = "online"; this.statusText = "";
    this.contacts = { groups: [] };
    this.jidToUser = new Map();
    this.presence = new Map(); // userId → {mode, statusText}
    this.messages = new MessageStore(ttlDays);
    this.x = null; this.online = false;
  }

  // ------------------------------------------------------------- HTTP API
  async api(method, path, body, headers = {}) {
    let res;
    try {
      res = await this.fetch(this.apiBase + path, {
        method, headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(this.token ? { authorization: `Bearer ${this.token}` } : {}), ...headers },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError(0, { error: { code: "NETWORK", message: `Không kết nối được máy chủ ${this.apiBase}. Kiểm tra kết nối mạng; nếu vẫn lỗi, báo quản trị viên kiểm tra máy chủ.` } });
    }
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : undefined; }
    catch {
      // Ví dụ: địa chỉ trỏ nhầm sang một website/ứng dụng khác trả về trang HTML.
      throw new ApiError(res.status, { error: { code: "BAD_SERVER", message: `Địa chỉ ${this.apiBase} không phải máy chủ Zahu!Messenger. Báo quản trị viên kiểm tra địa chỉ máy chủ của bản cài.` } });
    }
    if (!res.ok) {
      if (res.status === 401 && this.token && path !== "/v1/auth/login") this.emit("session-expired");
      throw new ApiError(res.status, data);
    }
    return data;
  }

  // ------------------------------------------------------------- Tài khoản
  registerStart(inviteCode, channel, address) { return this.api("POST", "/v1/registration/start", { inviteCode, channel, address }); }
  registerVerify(registrationId, otp) { return this.api("POST", "/v1/registration/verify", { registrationId, otp }); }
  async registerComplete(verificationToken, password, nick) {
    const r = await this.api("POST", "/v1/registration/complete", { verificationToken, password, nick });
    return this.useSession(r.token);
  }
  async login(identifier, password) {
    const r = await this.api("POST", "/v1/auth/login", { identifier, password });
    return this.useSession(r.token);
  }
  recoveryStart(address) { return this.api("POST", "/v1/auth/recovery/start", { address }); }
  recoveryComplete(recoveryId, otp, newPassword) { return this.api("POST", "/v1/auth/recovery/complete", { recoveryId, otp, newPassword }); }
  async useSession(token) {
    this.token = token;
    this.me = await this.api("GET", "/v1/me");
    return this.me;
  }
  async logout() {
    try { await this.api("POST", "/v1/auth/logout"); } catch { /* phiên có thể đã hết hạn */ }
    await this.disconnect();
    this.token = null; this.me = null; this.messages.clear(); this.presence.clear();
  }
  async changeNick(nick) { const r = await this.api("PUT", "/v1/me/nick", { nick }); this.me.nick = r.nick; this.emit("me", this.me); return r; }
  changePassword(currentPassword, newPassword) { return this.api("PUT", "/v1/me/password", { currentPassword, newPassword }); }

  // ------------------------------------------------------------- Danh bạ
  async refreshContacts() {
    this.contacts = await this.api("GET", "/v1/contacts");
    this.jidToUser.clear();
    for (const g of this.contacts.groups) for (const c of g.contacts) this.jidToUser.set(c.jid, c.userId);
    this.emit("contacts", this.contactsView());
    return this.contactsView();
  }
  contactsView() {
    return {
      groups: this.contacts.groups.map((g) => ({
        ...g, contacts: g.contacts.map((c) => ({ ...c, ...(this.presence.get(c.userId) ?? { mode: "offline", statusText: "" }) })),
      })),
    };
  }
  contactById(userId) { for (const g of this.contacts.groups) for (const c of g.contacts) if (c.userId === userId) return c; return null; }
  lookup(nick) { return this.api("GET", `/v1/users/lookup?nick=${encodeURIComponent(nick)}`); }
  sendFriendRequest(toUserId) { return this.api("POST", "/v1/friend-requests", { toUserId }, { "idempotency-key": randomUUID() }); }
  async listRequests() {
    const [incoming, outgoing] = await Promise.all([this.api("GET", "/v1/friend-requests?direction=in"), this.api("GET", "/v1/friend-requests?direction=out")]);
    return { incoming: incoming.requests, outgoing: outgoing.requests };
  }
  async decideRequest(requestId, action) { await this.api("POST", `/v1/friend-requests/${requestId}/${action}`, {}); await this.refreshContacts(); }
  async removeFriend(userId) { await this.api("DELETE", `/v1/friends/${userId}`); await this.refreshContacts(); }
  async block(userId) { await this.api("POST", "/v1/blocks", { userId }); await this.refreshContacts(); }
  async unblock(userId) { await this.api("DELETE", `/v1/blocks/${userId}`); }
  listBlocks() { return this.api("GET", "/v1/blocks"); }
  async createGroup(name) { const r = await this.api("POST", "/v1/groups", { name }); await this.refreshContacts(); return r; }
  async renameGroup(groupId, name) { await this.api("PATCH", `/v1/groups/${groupId}`, { name }); await this.refreshContacts(); }
  async deleteGroup(groupId) { await this.api("DELETE", `/v1/groups/${groupId}`); await this.refreshContacts(); }
  async moveContact(userId, groupId) { await this.api("PUT", `/v1/contacts/${userId}/group`, { groupId }); await this.refreshContacts(); }

  // ------------------------------------------------------------- Kết nối XMPP
  async connect() {
    if (this.x) return;
    if (this.insecureTls) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // CHỈ máy chủ thử nghiệm cert tự ký
    await this.refreshContacts();
    let info = await this.api("POST", "/v1/xmpp/token");
    assertSecureEndpoint(info.service, this.insecureTls);
    const x = xmppClient({
      service: info.service, domain: info.domain, resource: "win-" + randomUUID().slice(0, 8),
      // Mỗi lần (kể cả tự kết nối lại) lấy token mới từ API.
      credentials: async (auth, mechanisms) => {
        if (!info) info = await this.api("POST", "/v1/xmpp/token");
        const creds = { username: info.username, password: info.token };
        info = null;
        return auth(creds, mechanisms.includes("PLAIN") ? "PLAIN" : mechanisms[0]);
      },
    });
    this.x = x;
    x.on("error", (e) => this.emit("connection", { state: "error", message: String(e?.message ?? e) }));
    x.on("offline", () => { this.online = false; this.emit("connection", { state: "offline" }); });
    x.on("disconnect", () => { this.online = false; this.markAllOffline(); this.emit("connection", { state: "reconnecting" }); });
    x.on("stanza", (s) => { try { this.onStanza(s); } catch (e) { this.emit("warn", String(e)); } });
    // Roster push từ appsvc (kết bạn/xóa bạn): trả result và tải lại danh bạ.
    x.iqCallee.set("jabber:iq:roster", "query", () => { this.refreshContacts().catch(() => {}); return true; });
    x.on("online", async () => {
      this.online = true;
      this.emit("connection", { state: "online" });
      await this.sendOwnPresence();
      await this.syncHistory().catch((e) => this.emit("warn", "MAM: " + e.message));
      await this.resendPending();
    });
    await x.start();
  }
  async disconnect() {
    const x = this.x; this.x = null; this.online = false;
    if (x) { try { await x.stop(); } catch { /* */ } }
    this.markAllOffline();
  }
  markAllOffline() { this.presence.clear(); this.emit("contacts", this.contactsView()); }

  async setPresence(mode, statusText = this.statusText) {
    this.mode = mode; this.statusText = String(statusText ?? "").slice(0, 140);
    await this.sendOwnPresence();
    this.emit("me-presence", { mode: this.mode, statusText: this.statusText });
  }
  async sendOwnPresence() {
    if (!this.x || !this.online) return;
    const p = presenceForMode(this.mode);
    if (p === null) {
      // Ẩn: rút presence (bạn bè thấy Offline). Kết nối vẫn mở để nhận tin.
      if (this.wasAvailable) await this.x.send(xml("presence", { type: "unavailable" }));
      this.wasAvailable = false;
      return;
    }
    const kids = [];
    if (p.show) kids.push(xml("show", {}, p.show));
    if (this.statusText) kids.push(xml("status", {}, this.statusText));
    await this.x.send(xml("presence", {}, ...kids));
    this.wasAvailable = true;
  }

  // ------------------------------------------------------------- Xử lý stanza
  onStanza(s) {
    if (s.is("presence")) return this.onPresence(s);
    if (s.is("message")) return this.onMessage(s);
  }
  onPresence(s) {
    const bare = (s.attrs.from ?? "").split("/")[0];
    const userId = this.jidToUser.get(bare) ?? jidToUserId(bare);
    if (!userId || userId === this.me?.userId) return;
    const mode = presenceMode(s.attrs.type, s.getChildText("show"));
    this.presence.set(userId, { mode, statusText: mode === "offline" ? "" : (s.getChildText("status") ?? "") });
    this.emit("presence", { userId, ...this.presence.get(userId) });
    this.emit("contacts", this.contactsView());
  }
  onMessage(s) {
    const from = s.attrs.from ?? "";
    // Ack "stored" từ server cho tin mình gửi.
    const ack = s.getChild("stored", Xmlns.ACK);
    if (ack) return this.onAck(ack);
    const ev = s.getChild("event", Xmlns.EVENT);
    if (ev) return this.onServerEvent(ev.attrs.type);
    if (s.getChild("attention", Xmlns.ATTENTION)) {
      const b = s.getChild("buzz", Xmlns.BUZZ);
      const fromUserId = jidToUserId(from);
      if (b && fromUserId) this.emit("buzz", { fromUserId, buzzId: b.attrs.id, expiresAtMs: Date.parse(b.attrs.expires) });
      return;
    }
    if (s.attrs.type === "error") {
      const oid = s.getChild("origin-id", Xmlns.SID)?.attrs.id;
      const peer = jidToUserId(from);
      const cond = s.getChild("error")?.getChildText("text", STANZAS);
      if (oid && peer) this.updateStatus(peer, oid, "failed", cond === "NOT_FRIENDS" ? "Không còn là bạn bè" : "Không gửi được");
      return;
    }
    const received = s.getChild("received", Xmlns.RECEIPTS);
    if (received) {
      const peer = jidToUserId(from);
      if (peer) this.updateStatus(peer, received.attrs.id, "delivered");
      return;
    }
    const body = s.getChildText("body");
    if (s.attrs.type === "chat" && body != null) {
      const peer = jidToUserId(from);
      if (!peer) return;
      const originId = s.getChild("origin-id", Xmlns.SID)?.attrs.id ?? s.attrs.id ?? randomUUID();
      const stanzaId = s.getChildren("stanza-id", Xmlns.SID).find((x) => x.attrs.by === this.me?.jid)?.attrs.id;
      const { msg, added } = this.messages.upsert({ peer, originId, stanzaId, dir: "in", body, ts: this.now(), status: "delivered" }, this.now());
      if (added) {
        this.emit("message", msg);
        this.emit("incoming-message", { peer }); // chỉ tin đến trực tiếp (không phải đồng bộ lịch sử) → có thể bật cửa sổ chat
      }
      // Gửi xác nhận đã chuyển — trừ khi đang Ẩn (receipt sẽ làm lộ là đang kết nối).
      if (s.getChild("request", Xmlns.RECEIPTS) && this.mode !== "invisible" && s.attrs.id) {
        this.x?.send(xml("message", { to: from, type: "chat" }, xml("received", { xmlns: Xmlns.RECEIPTS, id: s.attrs.id }))).catch(() => {});
      }
    }
  }
  onAck(ack) {
    const oid = ack.attrs["origin-id"];
    for (const m of this.messages.pending().concat([...this.messages.byPeer.values()].flat())) {
      if (m.originId === oid) {
        this.messages.upsert({ peer: m.peer, originId: oid, stanzaId: ack.attrs.id, ts: Date.parse(ack.attrs.ts), status: "stored" }, this.now());
        this.emit("message-status", { ...m });
        return;
      }
    }
  }
  onServerEvent(type) {
    this.emit("server-event", { type });
    if (["friend.accepted", "friend.removed", "contacts.changed", "nick.changed"].includes(type)) this.refreshContacts().catch(() => {});
    if (type === "friend.request") this.emit("requests-changed");
  }
  updateStatus(peer, originId, status, error) {
    const m = this.messages.find(peer, originId);
    if (!m) return;
    if (status === "failed") { m.status = "failed"; m.error = error; } else this.messages.upsert({ peer, originId, status }, this.now());
    this.emit("message-status", { ...m });
  }

  // ------------------------------------------------------------- Tin nhắn
  conversation(userId) { return this.messages.list(userId).map((m) => ({ ...m })); }
  async sendMessage(userId, text) {
    const body = String(text).slice(0, 4000);
    if (!body.trim()) throw new Error("Tin nhắn trống");
    const contact = this.contactById(userId);
    if (!contact) throw new ApiError(403, { error: { code: "NOT_FRIENDS", message: "Chỉ nhắn được cho bạn bè" } });
    const originId = randomUUID();
    const { msg } = this.messages.upsert({ peer: userId, originId, dir: "out", body, status: "sending" }, this.now());
    this.emit("message", { ...msg });
    await this.transmit(contact.jid, msg);
    return { ...msg };
  }
  async transmit(jid, m) {
    if (!this.x || !this.online) return; // sẽ gửi lại khi online
    await this.x.send(xml("message", { to: jid, type: "chat", id: m.originId },
      xml("body", {}, m.body),
      xml("origin-id", { xmlns: Xmlns.SID, id: m.originId }),
      xml("request", { xmlns: Xmlns.RECEIPTS })));
  }
  /** Gửi lại tin chưa được server xác nhận, giữ nguyên originId → server bỏ bản trùng. */
  async resendPending() {
    for (const m of this.messages.pending()) {
      const c = this.contactById(m.peer);
      if (c) await this.transmit(c.jid, m).catch(() => {});
    }
  }
  /** Đồng bộ lịch sử từ MAM (server đã lọc tin quá 30 ngày). */
  async syncHistory() {
    if (!this.x) return;
    let after;
    for (let page = 0; page < 50; page++) {
      const qid = randomUUID();
      const results = [];
      const collect = (s) => { const r = s.getChild?.("result", Xmlns.MAM); if (r?.attrs.queryid === qid) results.push(r); };
      this.x.on("stanza", collect);
      let fin;
      try {
        const set = xml("set", { xmlns: "http://jabber.org/protocol/rsm" }, xml("max", {}, "200"), ...(after ? [xml("after", {}, after)] : []));
        const res = await this.x.iqCaller.request(xml("iq", { type: "set" }, xml("query", { xmlns: Xmlns.MAM, queryid: qid }, set)), 15000);
        fin = res.getChild("fin", Xmlns.MAM);
      } finally { this.x.removeListener("stanza", collect); }
      for (const r of results) this.ingestArchived(r);
      after = fin?.getChild("set", "http://jabber.org/protocol/rsm")?.getChildText("last");
      if (fin?.attrs.complete === "true" || !after) break;
    }
    this.emit("history-synced");
  }
  ingestArchived(result) {
    const fwd = result.getChild("forwarded", "urn:xmpp:forward:0");
    const m = fwd?.getChild("message");
    const body = m?.getChildText("body");
    if (!m || body == null) return;
    const ts = Date.parse(fwd.getChild("delay", "urn:xmpp:delay")?.attrs.stamp ?? "");
    const fromBare = (m.attrs.from ?? "").split("/")[0];
    const out = fromBare === this.me.jid;
    const peer = jidToUserId(out ? m.attrs.to : m.attrs.from);
    if (!peer) return;
    const originId = m.getChild("origin-id", Xmlns.SID)?.attrs.id ?? result.attrs.id;
    const { msg, added } = this.messages.upsert({ peer, originId, stanzaId: result.attrs.id, dir: out ? "out" : "in", body, ts, status: out ? "stored" : "delivered" }, this.now());
    if (added && msg) this.emit("message", { ...msg });
  }
  sweepExpired() { const n = this.messages.sweep(this.now()); if (n) this.emit("messages-expired", n); return n; }

  // ------------------------------------------------------------- Buzz
  async buzz(userId) {
    try {
      await this.api("POST", "/v1/buzz", { toUserId: userId }, { "idempotency-key": randomUUID() });
      return { ok: true };
    } catch (e) {
      if (e instanceof ApiError) return { ok: false, code: e.code, message: e.message, retryAfterSec: e.retryAfterSec };
      throw e;
    }
  }
}
