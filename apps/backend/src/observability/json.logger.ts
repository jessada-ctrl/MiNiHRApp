import { ConsoleLogger, LogLevel } from '@nestjs/common';
import { currentRequestContext } from './request-context';

/**
 * One JSON object per line in production, Nest's readable format otherwise.
 *
 * The hosting platform's log viewer shows a flat stream of text from every
 * process in the container. Finding what happened to one employee's request
 * in that means grepping colourised, multi-line output and hoping. Emitting
 * structured lines with a request id makes an incident a filter rather than
 * an archaeology exercise, and works with any log aggregator without
 * committing to one now.
 *
 * Kept as a ConsoleLogger subclass so every existing `new Logger(X)` call
 * across the codebase keeps working untouched.
 */
export class JsonLogger extends ConsoleLogger {
  private readonly asJson = process.env.LOG_FORMAT === 'json' || process.env.NODE_ENV === 'production';

  protected printMessages(messages: unknown[], context = '', logLevel: LogLevel = 'log', writeStreamType?: 'stdout' | 'stderr'): void {
    if (!this.asJson) {
      super.printMessages(messages, context, logLevel, writeStreamType);
      return;
    }

    const request = currentRequestContext();
    for (const message of messages) {
      const line = JSON.stringify({
        time: new Date().toISOString(),
        level: logLevel,
        context: context || undefined,
        requestId: request?.requestId,
        tenant: request?.tenant,
        message: this.stringify(message),
      });
      process[logLevel === 'error' || logLevel === 'fatal' ? 'stderr' : 'stdout'].write(`${line}\n`);
    }
  }

  private stringify(message: unknown): string {
    if (typeof message === 'string') return message;
    if (message instanceof Error) return `${message.name}: ${message.message}`;
    try {
      return JSON.stringify(message);
    } catch {
      return String(message);
    }
  }
}
