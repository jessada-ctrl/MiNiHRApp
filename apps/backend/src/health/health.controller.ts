import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { HealthService } from './health.service';

/**
 * Two endpoints, because they answer two different questions and only one of
 * them should ever page someone.
 *
 * The previous single `/health` returned HTTP 200 with `{"status":
 * "degraded"}` when the database was unreachable. Every uptime monitor keys
 * on the status code, so the app could be completely unable to serve a
 * request while the dashboard stayed green — the exact failure a monitor
 * exists to catch, reported as healthy.
 */
@SkipThrottle()
@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /**
   * Liveness: is this process running and able to answer HTTP at all?
   *
   * Touches no dependency on purpose. A container orchestrator restarts on a
   * failed liveness probe, and restarting the app does nothing about a
   * database outage — it just adds downtime to an already-bad moment.
   */
  @Get('health')
  @HttpCode(HttpStatus.OK)
  live() {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  /**
   * Readiness: can this process actually serve requests correctly?
   *
   * **This is the URL to point an uptime monitor at.** Returns 503 with a
   * per-check breakdown when something is wrong, so the alert says which
   * dependency broke rather than just "site down".
   */
  @Get('health/ready')
  async ready(@Res() res: Response) {
    const report = await this.health.readiness();
    res
      .status(report.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
      // Never let a proxy or CDN serve a stale "everything is fine".
      .setHeader('Cache-Control', 'no-store')
      .json(report);
  }
}
