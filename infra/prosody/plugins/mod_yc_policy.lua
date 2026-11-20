-- mod_yc_policy — thực thi quyền phía server cho YahooChat.
-- Quy tắc nghiệp vụ nằm ở services/api; module này chỉ đảm bảo client không đi vòng qua API.
local st = require "util.stanza";
local jid_split, jid_bare = require "util.jid".split, require "util.jid".bare;
local rm = require "core.rostermanager";
local dt = require "util.datetime";
local new_cache = require "util.cache".new;

local host = module.host;
local app_user = module:get_option_string("yc_appsvc_user", "appsvc");
local ttl = module:get_option_period("archive_expires_after", "30d");
local status_max = module:get_option_integer("yc_status_max_chars", 140, 0);

local XMLNS_APP = "urn:yahoochat:appsvc";
local XMLNS_EVT = "urn:yahoochat:event";
local XMLNS_ACK = "urn:yahoochat:ack";
local XMLNS_BUZZ = "urn:yahoochat:buzz";
local ATTENTION = "urn:xmpp:attention:0";
local MAM = "urn:xmpp:mam:2";
local SID = "urn:xmpp:sid:0";

local function is_app(origin)
	return origin and origin.type == "c2s" and origin.host == host and origin.username == app_user;
end
local function is_user_c2s(origin)
	return origin and origin.type == "c2s" and origin.username and not is_app(origin);
end
local function deny(event, text)
	event.origin.send(st.error_reply(event.stanza, "cancel", "not-allowed", text));
	return true;
end
local function user_sessions(username)
	local h = prosody.hosts[host];
	local u = h and h.sessions[username];
	return u and u.sessions or {};
end
local function is_available(session)
	return session.presence ~= nil and session.presence.attr.type == nil;
end
local function are_friends(username, contact_bare)
	local roster = rm.load_roster(username, host);
	local item = roster and roster[contact_bare];
	return item ~= nil and item.subscription == "both";
end

-------------------------------------------------------------------------------
-- Bộ lọc stanza THÔ từ kết nối client (filter "stanzas/in" của từng phiên c2s).
-- Không dùng hook pre-presence/pre-message vì các hook đó cũng nhận stanza do chính Prosody
-- sinh ra thay mặt người dùng (probe, broadcast tới bạn bè) — chặn ở đó sẽ chặn nhầm.
-------------------------------------------------------------------------------
local filters = require "util.filters";
local seen = new_cache(module:get_option_integer("yc_dedup_cache_size", 50000, 100));

local function send_ack(origin, origin_id, info)
	origin.send(st.message({ type = "headline", to = origin.full_jid, from = host })
		:tag("stored", { xmlns = XMLNS_ACK, ["origin-id"] = origin_id, id = info.id or "", ts = dt.datetime(info.ts) }));
end

local function reject(session, stanza, text)
	if stanza.attr.type ~= "error" then
		session.send(st.error_reply(stanza, "cancel", "not-allowed", text));
	end
	return nil; -- bỏ stanza
end

local function clamp_status(stanza)
	local status = stanza:get_child("status");
	if not status then return end
	local text = status:get_text() or "";
	local len = utf8.len(text);
	if len and len > status_max then
		local cut = utf8.offset(text, status_max + 1);
		stanza:maptags(function(t) if t.name == "status" then return nil end return t end);
		stanza:reset();
		stanza:text_tag("status", text:sub(1, cut - 1));
	end
end

local function client_filter(stanza, session)
	if not session.username or is_app(session) then return stanza end
	local name = stanza.name;
	local self_bare = session.username.."@"..host;
	local to = stanza.attr.to;
	local to_other = to ~= nil and jid_bare(to) ~= self_bare and to ~= host;

	if name == "presence" then
		-- Chỉ broadcast (không `to`). Cấm subscribe/probe/directed presence.
		if to then return reject(session, stanza, "Directed presence not allowed") end
		local t = stanza.attr.type;
		if t ~= nil and t ~= "unavailable" then return reject(session, stanza, "Presence type not allowed") end
		clamp_status(stanza);
		return stanza;
	elseif name == "iq" then
		-- Cấm IQ giữa người dùng (dò phiên Ẩn qua ping/disco/version tới full JID).
		if to_other then
			if stanza.attr.type == "result" or stanza.attr.type == "error" then return nil end
			return reject(session, stanza, "User-to-user IQ not allowed");
		end
		return stanza;
	elseif name == "message" then
		if stanza:get_child("attention", ATTENTION) or stanza:get_child("event", XMLNS_EVT)
			or stanza:get_child("stored", XMLNS_ACK) or stanza:get_child("buzz", XMLNS_BUZZ) then
			return reject(session, stanza, "Reserved payload");
		end
		if not to_other then return stanza end -- tới chính mình (carbons)
		if (stanza.attr.type or "normal") ~= "chat" then return reject(session, stanza, "Only chat messages are allowed") end
		local node, to_host = jid_split(to);
		if to_host ~= host or not node or not are_friends(session.username, jid_bare(to)) then
			return reject(session, stanza, "NOT_FRIENDS");
		end
		if stanza:get_child("body") then
			local oid = stanza:get_child("origin-id", SID);
			local origin_id = oid and oid.attr.id;
			if not origin_id or #origin_id > 64 then return reject(session, stanza, "origin-id required") end
			local key = session.username.."|"..origin_id;
			local prev = seen:get(key);
			if prev then
				if prev.id then send_ack(session, origin_id, prev) end
				return nil; -- bản trùng: không lưu, không chuyển
			end
			seen:set(key, { ts = os.time() });
		end
		return stanza;
	end
	return stanza;
end

local function attach(session)
	if (session.type == "c2s_unauthed" or session.type == "c2s") and not session.yc_filtered then
		session.yc_filtered = true;
		filters.add_filter(session, "stanzas/in", client_filter, 1000);
	end
end
filters.add_filter_hook(attach);
module:hook("resource-bind", function(event) attach(event.session) end, 1000); -- an toàn nếu module nạp sau khi phiên mở
function module.unload() filters.remove_filter_hook(attach) end

-- Roster: client chỉ được đọc.
module:hook("iq/self/jabber:iq:roster:query", function(event)
	if event.stanza.attr.type == "set" and not is_app(event.origin) then
		event.origin.send(st.error_reply(event.stanza, "cancel", "not-allowed"));
		return true;
	end
end, 1000);

-- Khi mod_mam lưu xong bản của NGƯỜI GỬI: trả ack "stored" với id và timestamp server.
module:hook("archive-message-added", function(event)
	local origin, stanza = event.origin, event.stanza;
	if not is_user_c2s(origin) or event.for_user ~= origin.username then return end
	local oid = stanza:get_child("origin-id", SID);
	if not oid then return end
	local key = origin.username.."|"..oid.attr.id;
	local info = { id = event.id, ts = os.time() };
	seen:set(key, info);
	send_ack(origin, oid.attr.id, info);
end);

-- Người nhận đang Ẩn (kết nối nhưng không available): vẫn chuyển tin chat tới phiên đó.
-- Không có tác động quan sát được với người gửi (không bounce, không receipt từ server).
module:hook("message/offline/handle", function(event)
	local stanza = event.stanza;
	if stanza.attr.type ~= "chat" or not stanza:get_child("body") then return end
	local node = jid_split(stanza.attr.to);
	for _, session in pairs(user_sessions(node)) do
		if session.yc_ready and not is_available(session) then
			local copy = st.clone(stanza);
			copy.attr.to = session.full_jid;
			session.send(copy);
		end
	end
end, 10);
-- Đánh dấu phiên đã sẵn sàng nhận (sau bind) để không đẩy vào phiên đang xác thực.
module:hook("resource-bind", function(event) event.session.yc_ready = true; end);

-------------------------------------------------------------------------------
-- MAM: mọi truy vấn chỉ thấy tin trong hạn, không phụ thuộc job xóa.
-------------------------------------------------------------------------------
module:hook("iq-set/self/"..MAM..":query", function(event)
	local query = event.stanza.tags[1];
	local cutoff = os.time() - ttl;
	local form = query:get_child("x", "jabber:x:data");
	if not form then
		form = st.stanza("x", { xmlns = "jabber:x:data", type = "submit" })
			:tag("field", { var = "FORM_TYPE", type = "hidden" }):text_tag("value", MAM):up();
		query:add_direct_child(form);
	end
	local start = cutoff;
	form:maptags(function(f)
		if f.name == "field" and f.attr.var == "start" then
			local v = dt.parse(f:get_child_text("value") or "");
			if v and v > start then start = v end
			return nil;
		end
		return f;
	end);
	form:tag("field", { var = "start" }):text_tag("value", dt.datetime(start)):up();
end, 1000);

-------------------------------------------------------------------------------
-- Lệnh của dịch vụ ứng dụng (chỉ appsvc): <command xmlns="urn:yahoochat:appsvc" action="..."/>
-------------------------------------------------------------------------------
local function send_presence_between(from_user, to_user)
	for _, s in pairs(user_sessions(from_user)) do
		if is_available(s) then
			local p = st.clone(s.presence);
			p.attr.from = s.full_jid; p.attr.to = to_user.."@"..host;
			module:send(p);
		end
	end
end
local function send_unavailable_between(from_user, to_user)
	for _, s in pairs(user_sessions(from_user)) do
		module:send(st.presence({ type = "unavailable", from = s.full_jid, to = to_user.."@"..host }));
	end
end

local actions = {};
function actions.friend_add(cmd)
	local a, b = cmd.attr.a, cmd.attr.b;
	for _, pair in ipairs({ { a, b }, { b, a } }) do
		local roster = rm.load_roster(pair[1], host);
		roster[pair[2].."@"..host] = { subscription = "both", groups = {} };
		rm.save_roster(pair[1], host, roster);
		rm.roster_push(pair[1], host, pair[2].."@"..host);
	end
	send_presence_between(a, b); send_presence_between(b, a);
	return st.stanza("ok", { xmlns = XMLNS_APP });
end
function actions.friend_remove(cmd)
	local a, b = cmd.attr.a, cmd.attr.b;
	send_unavailable_between(a, b); send_unavailable_between(b, a);
	for _, pair in ipairs({ { a, b }, { b, a } }) do
		local roster = rm.load_roster(pair[1], host);
		if roster[pair[2].."@"..host] then
			roster[pair[2].."@"..host] = nil;
			rm.save_roster(pair[1], host, roster);
			rm.roster_push(pair[1], host, pair[2].."@"..host);
		end
	end
	return st.stanza("ok", { xmlns = XMLNS_APP });
end
-- Buzz: chỉ giao tới phiên available tại thời điểm xử lý (Prosody đơn luồng → không xen với đổi Ẩn).
function actions.buzz(cmd)
	local from, to = cmd.attr.from, cmd.attr.to;
	local delivered = 0;
	if are_friends(to, from.."@"..host) then
		for _, s in pairs(user_sessions(to)) do
			if is_available(s) then
				s.send(st.message({ type = "headline", from = from.."@"..host, to = s.full_jid })
					:tag("attention", { xmlns = ATTENTION }):up()
					:tag("buzz", { xmlns = XMLNS_BUZZ, id = cmd.attr.id, expires = cmd.attr.expires }));
				delivered = delivered + 1;
			end
		end
	end
	return st.stanza("delivered", { xmlns = XMLNS_APP, count = tostring(delivered) });
end
function actions.notify(cmd)
	local count = 0;
	for _, s in pairs(user_sessions(cmd.attr.to)) do
		if s.yc_ready then
			s.send(st.message({ type = "headline", from = host, to = s.full_jid })
				:tag("event", { xmlns = XMLNS_EVT, type = cmd.attr.type }):text(cmd:get_text() or "{}"));
			count = count + 1;
		end
	end
	return st.stanza("delivered", { xmlns = XMLNS_APP, count = tostring(count) });
end
function actions.disconnect(cmd)
	for _, s in pairs(user_sessions(cmd.attr.user)) do
		s:close({ condition = "policy-violation", text = "session revoked" });
	end
	return st.stanza("ok", { xmlns = XMLNS_APP });
end
function actions.online(cmd)
	local any = false;
	for _, s in pairs(user_sessions(cmd.attr.user)) do if is_available(s) then any = true end end
	return st.stanza("online", { xmlns = XMLNS_APP, value = any and "true" or "false" });
end

module:hook("iq-set/host/"..XMLNS_APP..":command", function(event)
	local origin, stanza = event.origin, event.stanza;
	if not is_app(origin) then
		origin.send(st.error_reply(stanza, "cancel", "forbidden"));
		return true;
	end
	local cmd = stanza.tags[1];
	local fn = actions[(cmd.attr.action or ""):gsub("-", "_")];
	if not fn then
		origin.send(st.error_reply(stanza, "modify", "bad-request", "unknown action"));
		return true;
	end
	local ok, res = pcall(fn, cmd);
	if not ok then
		module:log("error", "appsvc action %s failed: %s", cmd.attr.action, res);
		origin.send(st.error_reply(stanza, "wait", "internal-server-error"));
	else
		origin.send(st.reply(stanza):add_child(res));
	end
	return true;
end);
