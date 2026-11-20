// Gửi mã xác thực. Email: SMTP (local = Mailpit). SMS: provider giả lập cho tới khi được duyệt nhà cung cấp.
import nodemailer from "nodemailer";
import type { Db } from "./db.ts";
import type { Config } from "./config.ts";

export interface OtpSender {
  sendEmail(to: string, subject: string, text: string): Promise<void>;
  sendSms(to: string, text: string): Promise<void>;
}

export function createOtpSender(config: Config, db: Db): OtpSender {
  const transport = nodemailer.createTransport({
    host: config.smtp.host, port: config.smtp.port, secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
  return {
    async sendEmail(to, subject, text) {
      await transport.sendMail({ from: config.smtp.from, to, subject, text });
    },
    async sendSms(to, text) {
      if (config.smsProvider !== "fake") throw new Error(`SMS provider '${config.smsProvider}' chưa được tích hợp`);
      // Provider giả lập: ghi vào hộp thư thử nghiệm trong DB; không gửi ra ngoài, không log nội dung.
      await db.query("INSERT INTO app.fake_sms_outbox(phone, body, created_at) VALUES ($1,$2,now())", [to, text]);
    },
  };
}
