-- Spike tiêu chí 6: xác thực bằng token ngắn hạn do dịch vụ ứng dụng ký (HMAC-SHA256, thư viện chuẩn của Prosody).
-- Token = "<exp_unix>.<hex hmac_sha256(secret, username .. '.' .. exp)>"
local hashes = require "util.hashes";
local new_sasl = require "util.sasl".new;
local secret = assert(module:get_option_string("appsvc_token_secret"), "appsvc_token_secret required");
local provider = {};

local function const_eq(a, b)
	if #a ~= #b then return false end
	local r = 0;
	for i = 1, #a do r = r | (a:byte(i) ~ b:byte(i)) end
	return r == 0;
end

function provider.test_password(username, token)
	local exp, sig = tostring(token):match("^(%d+)%.(%x+)$");
	if not exp or tonumber(exp) < os.time() then return nil, "expired"; end
	local expect = hashes.hmac_sha256(secret, username.."."..exp, true);
	if const_eq(expect, sig:lower()) then return true; end
	return nil, "invalid";
end
function provider.user_exists(username) return true; end
function provider.get_password() return nil, "not supported"; end
function provider.set_password() return nil, "not supported"; end
function provider.create_user() return nil, "not supported"; end
function provider.users() return function() return nil end; end
function provider.get_sasl_handler()
	return new_sasl(module.host, {
		plain_test = function(_, username, password)
			return provider.test_password(username, password), true;
		end;
	});
end
module:provides("auth", provider);
