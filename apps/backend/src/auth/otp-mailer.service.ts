import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

const OTP_TTL_MINUTES = 5;

/**
 * FR-2.1: delivers the account-binding OTP to the employee's company email.
 *
 * Sends over SMTP when SMTP_HOST is configured, and falls back to logging the
 * code when it isn't. The fallback exists so a fresh local checkout can still
 * exercise the whole binding flow without an email account — it is NOT a
 * production mode: `assertConfiguredInProduction` refuses to boot a
 * NODE_ENV=production process without SMTP, because OTP is the only way an
 * employee can ever bind their LINE account, so silently logging codes to
 * stdout in production would mean nobody at any customer could sign in and
 * the failure would look like "the app is broken" rather than "email is
 * unconfigured".
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
export class OtpMailerService implements OnModuleInit {
  private readonly logger = new Logger(OtpMailerService.name);
  private transporter: Transporter | null = null;

  onModuleInit() {
    const host = process.env.SMTP_HOST?.trim();
    if (!host) {
      this.assertConfiguredInProduction();
      this.logger.warn('SMTP_HOST is not set — OTP codes will be logged instead of emailed (local development only).');
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

    this.logger.log(`OTP email delivery enabled via ${host}`);
  }

  private assertConfiguredInProduction() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'SMTP_HOST is required when NODE_ENV=production — without it no employee can receive an OTP and account binding (FR-2.1) is impossible. Set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD/MAIL_FROM.',
      );
    }
  }

  async send(email: string, code: string): Promise<void> {
    if (!this.transporter) {
      this.logger.log(`[MOCK EMAIL] OTP for ${email}: ${code} (expires in ${OTP_TTL_MINUTES} minutes)`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: process.env.MAIL_FROM ?? "Lala' <no-reply@lala.local>",
        to: email,
        subject: `รหัสยืนยันตัวตน (OTP): ${code}`,
        text: this.plainTextBody(code),
        html: this.htmlBody(code),
      });
    } catch (error) {
      // Deliberately swallowed. requestOtp() must return the same generic
      // response whether or not the address matched a real employee (its
      // anti-enumeration guarantee, see BUG-007) — letting a send failure
      // become a 500 would leak exactly that distinction, since no email is
      // even attempted for a non-matching pair. The employee sees "check
      // your email", finds nothing, and retries; the operator sees this.
      this.logger.error(`Failed to send OTP email to ${email}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private plainTextBody(code: string): string {
    return [
      'รหัสยืนยันตัวตนสำหรับผูกบัญชี LINE ของคุณคือ',
      '',
      code,
      '',
      `รหัสนี้จะหมดอายุใน ${OTP_TTL_MINUTES} นาที`,
      'หากคุณไม่ได้เป็นผู้ขอรหัสนี้ กรุณาแจ้งฝ่ายบุคคลของบริษัท',
    ].join('\n');
  }

  private htmlBody(code: string): string {
    return `
      <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1a2332;line-height:1.6">
        <p>รหัสยืนยันตัวตนสำหรับผูกบัญชี LINE ของคุณคือ</p>
        <p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:24px 0">${code}</p>
        <p style="color:#5a6a7d;font-size:14px">รหัสนี้จะหมดอายุใน ${OTP_TTL_MINUTES} นาที</p>
        <p style="color:#5a6a7d;font-size:14px">หากคุณไม่ได้เป็นผู้ขอรหัสนี้ กรุณาแจ้งฝ่ายบุคคลของบริษัท</p>
      </div>
    `;
  }
}
