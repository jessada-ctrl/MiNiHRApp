import { Injectable, Logger } from '@nestjs/common';

/**
 * FR-2.1 sends the OTP to the employee's company email. There is no real
 * email provider wired up yet (same "external dependency not set up"
 * situation as the LINE Messaging API) — this stub logs the code instead of
 * sending it, so the OTP flow is fully exercisable end-to-end today. Swap
 * the body of `send()` for a real provider (SES/SendGrid/SMTP/etc.) once
 * one exists; nothing else in the OTP flow needs to change.
 */
@Injectable()
export class OtpMailerService {
  private readonly logger = new Logger(OtpMailerService.name);

  async send(email: string, code: string): Promise<void> {
    this.logger.log(`[MOCK EMAIL] OTP for ${email}: ${code} (expires in 5 minutes)`);
  }
}
