import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '../auth/mailer.service';

const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';

/**
 * How long the same alert key stays quiet after firing.
 *
 * A failing dependency doesn't fail once — a backup job that can't reach
 * object storage fails every night, and a broken cron can fail every minute.
 * Without this, the first real incident buries the team's inbox and the LINE
 * group, and the next genuine alert arrives in a feed nobody reads any more.
 */
const COOLDOWN_MS = 60 * 60 * 1000;

export type AlertSeverity = 'warning' | 'critical';

export interface Alert {
  /** Stable identifier for the *kind* of problem — the cooldown is keyed on this, so it must not include timestamps or ids. */
  key: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
}

/**
 * Operator alerts: things a human on the LaLa' team needs to know about the
 * platform itself, as distinct from anything a tenant's employees see.
 *
 * Delivery is best-effort and never throws. Every caller is already on a
 * failure path — a backup that just failed, a health check that just went
 * red — and an alert that raises turns a recoverable problem into a second,
 * louder one while still not telling anybody.
 *
 * Config:
 *   ALERT_EMAIL_TO                    comma-separated recipients
 *   ALERT_LINE_CHANNEL_ACCESS_TOKEN   the *platform* LINE OA, not a tenant's
 *   ALERT_LINE_TARGET_ID              group/room/user id to push to
 */
@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);
  private readonly lastSentAt = new Map<string, number>();

  constructor(private readonly mailer: MailerService) {}

  async send(alert: Alert): Promise<void> {
    // Logged before the cooldown check, so the log always has the full
    // history even when notifications are being suppressed.
    const line = `[${alert.severity.toUpperCase()}] ${alert.title} — ${alert.detail}`;
    if (alert.severity === 'critical') this.logger.error(line);
    else this.logger.warn(line);

    if (this.isCoolingDown(alert.key)) return;
    this.lastSentAt.set(alert.key, Date.now());

    await Promise.all([this.sendEmail(alert), this.sendLine(alert)]);
  }

  /**
   * Call when a previously-failing thing succeeds, so the next failure alerts
   * immediately instead of being swallowed by a cooldown started an hour ago.
   */
  clear(key: string): void {
    this.lastSentAt.delete(key);
  }

  private isCoolingDown(key: string): boolean {
    const last = this.lastSentAt.get(key);
    return last !== undefined && Date.now() - last < COOLDOWN_MS;
  }

  private async sendEmail(alert: Alert): Promise<void> {
    const recipients = (process.env.ALERT_EMAIL_TO ?? '')
      .split(',')
      .map((address) => address.trim())
      .filter(Boolean);
    if (recipients.length === 0) return;

    try {
      await this.mailer.sendOperatorAlert(recipients, alert.severity, alert.title, alert.detail);
    } catch (error) {
      this.logger.error(`Alert email failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Pushed via the platform's own LINE OA — never a tenant's channel, which
   * belongs to that customer and whose members are their employees.
   */
  private async sendLine(alert: Alert): Promise<void> {
    const accessToken = process.env.ALERT_LINE_CHANNEL_ACCESS_TOKEN?.trim();
    const target = process.env.ALERT_LINE_TARGET_ID?.trim();
    if (!accessToken || !target) return;

    const icon = alert.severity === 'critical' ? '🔴' : '🟠';
    const text = `${icon} ${alert.title}\n\n${alert.detail}`;

    try {
      const res = await fetch(LINE_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ to: target, messages: [{ type: 'text', text: text.slice(0, 4900) }] }),
      });
      if (!res.ok) {
        this.logger.error(`Alert LINE push failed: ${res.status} ${await res.text()}`);
      }
    } catch (error) {
      this.logger.error(`Alert LINE push threw: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
