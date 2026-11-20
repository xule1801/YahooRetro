import { ErrorCode } from "@yc/contracts";
type Code = keyof typeof ErrorCode;
const STATUS: Record<Code, number> = {
  INVALID_INPUT: 400, UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, INVITE_INVALID: 400,
  VERIFICATION_FAILED: 400, NICK_UNAVAILABLE: 409, NICK_INVALID: 400, RATE_LIMITED: 429,
  RECIPIENT_UNAVAILABLE: 409, NOT_FRIENDS: 403, CONFLICT: 409,
};
const MSG: Record<Code, string> = {
  INVALID_INPUT: "Dữ liệu không hợp lệ", UNAUTHENTICATED: "Chưa đăng nhập hoặc thông tin không đúng",
  FORBIDDEN: "Không có quyền", NOT_FOUND: "Không tìm thấy", INVITE_INVALID: "Mã mời không hợp lệ",
  VERIFICATION_FAILED: "Mã xác thực không đúng hoặc đã hết hạn", NICK_UNAVAILABLE: "Nick này không dùng được",
  NICK_INVALID: "Nick phải gồm 3–32 ký tự chữ, số hoặc dấu gạch dưới", RATE_LIMITED: "Thao tác quá nhanh, vui lòng thử lại sau",
  RECIPIENT_UNAVAILABLE: "Người nhận hiện không thể nhận Buzz", NOT_FRIENDS: "Chỉ thực hiện được với bạn bè",
  CONFLICT: "Xung đột dữ liệu, vui lòng thử lại",
};
export class AppError extends Error {
  code: Code; status: number; retryAfterSec?: number;
  constructor(code: Code, opts: { message?: string; retryAfterSec?: number } = {}) {
    super(opts.message ?? MSG[code]);
    this.code = code; this.status = STATUS[code]; this.retryAfterSec = opts.retryAfterSec;
  }
}
