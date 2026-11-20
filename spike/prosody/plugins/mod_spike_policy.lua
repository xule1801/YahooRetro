-- Spike tiêu chí 5: chỉ dịch vụ ứng dụng (appsvc@host) được tạo subscription và gửi Attention (Buzz).
local st = require "util.stanza";
local jid_bare = require "util.jid".bare;
local app_jid = module:get_option_string("spike_appsvc_jid", "appsvc@"..module.host);
local ATTENTION = "urn:xmpp:attention:0";

local function deny(event)
	event.origin.send(st.error_reply(event.stanza, "cancel", "not-allowed", "Policy: use app service"));
	return true;
end

local function from_app(origin)
	return origin.type == "c2s" and (origin.username.."@"..origin.host) == app_jid;
end

local function check_presence(event)
	local t = event.stanza.attr.type;
	if (t == "subscribe" or t == "subscribed") and event.origin.type == "c2s" and not from_app(event.origin) then
		return deny(event);
	end
end
module:hook("pre-presence/bare", check_presence, 1000);
module:hook("pre-presence/full", check_presence, 1000);

local function check_message(event)
	if event.origin.type == "c2s" and event.stanza:get_child("attention", ATTENTION) and not from_app(event.origin) then
		return deny(event);
	end
end
module:hook("pre-message/bare", check_message, 1000);
module:hook("pre-message/full", check_message, 1000);
module:hook("pre-message/host", check_message, 1000);

-- Roster-set từ client thường bị chặn (chỉ đọc roster)
module:hook("iq/self/jabber:iq:roster:query", function(event)
	if event.stanza.attr.type == "set" and not from_app(event.origin) then
		event.origin.send(st.error_reply(event.stanza, "cancel", "not-allowed"));
		return true;
	end
end, 1000);

-- Chỉ appsvc: tạo kết bạn hai chiều phía server: <friend xmlns="urn:spike:friend" a="alice" b="bob" group="Bạn học"/>
local rm = require "core.rostermanager";
module:hook("message/host", function(event)
	local f = event.stanza:get_child("friend", "urn:spike:friend");
	if not f then return end
	if not from_app(event.origin) then return deny(event) end
	local a, b, group = f.attr.a, f.attr.b, f.attr.group or "Bạn bè";
	for _, pair in ipairs({ {a, b}, {b, a} }) do
		local roster = rm.load_roster(pair[1], module.host);
		local contact = pair[2].."@"..module.host;
		roster[contact] = { subscription = "both", groups = { [group] = true } };
		rm.save_roster(pair[1], module.host, roster);
		rm.roster_push(pair[1], module.host, contact);
	end
	return true;
end, 1000);

-- Tiêu chí 2: ép mọi truy vấn MAM chỉ thấy tin trong hạn, không phụ thuộc job dọn hằng ngày.
local dt = require "util.datetime";
local ttl = module:get_option_period("archive_expires_after", "30d");
local XMLNS_MAM = "urn:xmpp:mam:2";
module:hook("iq-set/self/"..XMLNS_MAM..":query", function(event)
	local query = event.stanza.tags[1];
	local cutoff = os.time() - ttl;
	local form = query:get_child("x", "jabber:x:data");
	if not form then
		form = st.stanza("x", { xmlns = "jabber:x:data", type = "submit" })
			:tag("field", { var = "FORM_TYPE", type = "hidden" }):text_tag("value", XMLNS_MAM):up();
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
