import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { requestContext } from './request-context';

/**
 * Gives every request an id, echoes it back on the response, and puts it
 * where the logger can find it.
 *
 * An inbound `x-request-id` is reused when present so a trace survives the
 * reverse proxy in front of this process. That value is only ever used as a
 * log label — never for auth or lookup — but it is still length-capped and
 * stripped of anything but safe characters, because it ends up in log lines
 * that people and tools parse, and a caller-controlled string with newlines
 * in it can forge log entries.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const inbound = req.header('x-request-id');
    const requestId = sanitize(inbound) ?? randomUUID();

    res.setHeader('X-Request-Id', requestId);

    // Host is the tenant in this system, so it is the label worth carrying.
    // Read here rather than from tenantContext because this middleware runs
    // first, and unresolved-tenant failures are exactly when it's needed.
    const tenant = req.hostname?.split('.')[0];

    requestContext.run({ requestId, tenant }, () => next());
  }
}

function sanitize(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 64);
  return cleaned.length > 0 ? cleaned : null;
}
