import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

const OTP_TTL_MINUTES = 5;
const RESET_TTL_MINUTES = 60;

/**
 * Every email the system sends: the FR-2.1 account-binding OTP, and the
 * "forgot password" link.
 *
 * Sends over SMTP when SMTP_HOST is configured, and falls back to logging
 * when it isn't. The fallback exists so a fresh local checkout can exercise
 * both flows without an email account — it is NOT a production mode:
 * `assertConfiguredInProduction` refuses to boot a NODE_ENV=production
 * process without SMTP, because these two messages are the only routes back
 * into an account. Silently logging them to stdout in production would mean
 * nobody at any customer could sign in, and the failure would look like
 * "the app is broken" rather than "email is unconfigured".
 *
 * Config (all read once at boot):
 *   SMTP_HOST      required to enable real sending
 *   SMTP_PORT      default 587
 *   SMTP_SECURE    "true" for implicit TLS (port 465); default false (STARTTLS)
 *   SMTP_USER      optional — omit for an unauthenticated relay
 *   SMTP_PASSWORD  optional, paired with SMTP_USER
 *   MAIL_FROM      default "Lala' <no-reply@lala.local>"
 */
@Injectable()
export class MailerService implements OnModuleInit {
  private readonly logger = new Logger(MailerService.name);
  private transporter: Transporter | null = null;

  onModuleInit() {
    const host = process.env.SMTP_HOST?.trim();
    if (!host) {
      this.assertConfiguredInProduction();
      this.logger.warn('SMTP_HOST is not set — OTP codes and password reset links will be logged instead of emailed (local development only).');
      return;
    }

    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASSWORD;

    this.transporter = createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: user ? { user, pass } : undefined,
    });

    this.logger.log(`Email delivery enabled via ${host}`);
  }

  private assertConfiguredInProduction() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'SMTP_HOST is required when NODE_ENV=production — without it no employee can receive an OTP or a password reset link, so account binding (FR-2.1) and password recovery are both impossible. Set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD/MAIL_FROM.',
      );
    }
  }

  async sendOtp(email: string, code: string): Promise<void> {
    await this.send({
      to: email,
      subject: `รหัสยืนยันตัวตน (OTP): ${code}`,
      text: [
        'รหัสยืนยันตัวตนสำหรับผูกบัญชี LINE ของคุณคือ',
        '',
        code,
        '',
        `รหัสนี้จะหมดอายุใน ${OTP_TTL_MINUTES} นาที`,
        'หากคุณไม่ได้เป็นผู้ขอรหัสนี้ กรุณาแจ้งฝ่ายบุคคลของบริษัท',
      ].join('\n'),
      html: this.wrap(`
        <p>รหัสยืนยันตัวตนสำหรับผูกบัญชี LINE ของคุณคือ</p>
        <p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:24px 0">${code}</p>
        <p style="color:#5a6a7d;font-size:14px">รหัสนี้จะหมดอายุใน ${OTP_TTL_MINUTES} นาที</p>
        <p style="color:#5a6a7d;font-size:14px">หากคุณไม่ได้เป็นผู้ขอรหัสนี้ กรุณาแจ้งฝ่ายบุคคลของบริษัท</p>
      `),
      logLabel: `OTP for ${email}: ${code} (expires in ${OTP_TTL_MINUTES} minutes)`,
    });
  }

  async sendPasswordReset(email: string, fullName: string, resetUrl: string): Promise<void> {
    await this.send({
      to: email,
      subject: 'ตั้งรหัสผ่านใหม่สำหรับ LaLa\'',
      text: [
        `สวัสดีคุณ ${fullName}`,
        '',
        'มีการขอตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ เปิดลิงก์ด้านล่างเพื่อตั้งรหัสผ่านใหม่',
        '',
        resetUrl,
        '',
        `ลิงก์นี้ใช้ได้ครั้งเดียวและจะหมดอายุใน ${RESET_TTL_MINUTES} นาที`,
        'หากคุณไม่ได้เป็นผู้ขอ ไม่ต้องดำเนินการใดๆ รหัสผ่านเดิมของคุณจะยังใช้ได้ตามปกติ',
      ].join('\n'),
      html: this.wrap(`
        <p>สวัสดีคุณ ${this.escape(fullName)}</p>
        <p>มีการขอตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ กดปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่</p>
        <p style="margin:24px 0">
          <a href="${this.escape(resetUrl)}" style="display:inline-block;background:#1a2332;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">ตั้งรหัสผ่านใหม่</a>
        </p>
        <p style="color:#5a6a7d;font-size:13px;word-break:break-all">หากปุ่มใช้งานไม่ได้ ให้คัดลอกลิงก์นี้ไปวางในเบราว์เซอร์:<br>${this.escape(resetUrl)}</p>
        <p style="color:#5a6a7d;font-size:14px">ลิงก์นี้ใช้ได้ครั้งเดียวและจะหมดอายุใน ${RESET_TTL_MINUTES} นาที</p>
        <p style="color:#5a6a7d;font-size:14px">หากคุณไม่ได้เป็นผู้ขอ ไม่ต้องดำเนินการใดๆ รหัสผ่านเดิมของคุณจะยังใช้ได้ตามปกติ</p>
      `),
      logLabel: `Password reset for ${email}: ${resetUrl}`,
    });
  }

  /**
   * Operator alerts (AlertService), not customer mail — plain text, no
   * branding, subject prefixed so it can be filtered into its own folder.
   */
  async sendOperatorAlert(to: string[], severity: string, title: string, detail: string): Promise<void> {
    await this.send({
      to: to.join(', '),
      subject: `[LaLa' ${severity.toUpperCase()}] ${title}`,
      text: `${title}\n\n${detail}\n\nHost: ${process.env.HOSTNAME ?? 'unknown'}\nTime: ${new Date().toISOString()}`,
      html: this.wrap(
        `<p><strong>${this.escape(title)}</strong></p><pre style="white-space:pre-wrap;font-size:13px">${this.escape(detail)}</pre>` +
          `<p style="color:#5a6a7d;font-size:12px">Host: ${this.escape(process.env.HOSTNAME ?? 'unknown')}<br>Time: ${new Date().toISOString()}</p>`,
      ),
      logLabel: `ALERT ${severity}: ${title} — ${detail}`,
    });
  }

  private async send(message: { to: string; subject: string; text: string; html: string; logLabel: string }): Promise<void> {
    if (!this.transporter) {
      this.logger.log(`[MOCK EMAIL] ${message.logLabel}`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: process.env.MAIL_FROM ?? "Lala' <no-reply@lala.local>",
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    } catch (error) {
      // Deliberately swallowed. Both callers must return the same generic
      // response whether or not the address matched a real account (their
      // anti-enumeration guarantee — see BUG-007 and
      // PasswordService.requestReset); letting a send failure become a 500
      // would leak exactly that distinction, since no send is even attempted
      // for a non-matching address. The user sees "check your email", finds
      // nothing, and retries; the operator sees this.
      this.logger.error(`Failed to send "${message.subject}" to ${message.to}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private wrap(body: string): string {
    return `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1a2332;line-height:1.6">${body}</div>`;
  }

  /**
   * fullName is employee-controlled and resetUrl is built from the request's
   * Host header, so neither may be interpolated into HTML raw.
   */
  private escape(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
