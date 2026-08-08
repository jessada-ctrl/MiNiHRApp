import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

/**
 * Doubles as the boot smoke test — compiling AppModule is what catches a
 * missing provider or a broken import after a refactor.
 *
 * Both endpoints are hit without a tenant header on purpose: an uptime
 * monitor calls them on the bare host, and if they were ever caught by
 * TenantMiddleware every probe would 400 and the monitor would report the
 * deployment down while it was perfectly healthy.
 */
describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health is a dependency-free liveness signal', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', uptimeSeconds: expect.any(Number) });
  });

  it('GET /health/ready reports each dependency', async () => {
    const res = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(res.body).toEqual({
      status: 'ok',
      checks: { database: { state: 'up' }, attachments: { state: 'up' } },
    });
  });

  // The whole reason readiness is separate: a monitor keys on the status
  // code, so an unhealthy deployment has to answer non-200 or nobody finds
  // out. (The unhealthy path itself is covered in health.service.spec.ts,
  // which can take the database away without stopping the container.)
  it('GET /health/ready is not cached by anything in front of it', async () => {
    const res = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('echoes a request id for correlating logs', async () => {
    const res = await request(app.getHttpServer()).get('/health').set('X-Request-Id', 'trace-abc').expect(200);
    expect(res.headers['x-request-id']).toBe('trace-abc');
  });

  // That header is caller-controlled and lands in log lines. Node's HTTP
  // layer already rejects control characters outright, so this covers the
  // rest: printable characters that are legal to send but carry meaning to
  // whatever parses the logs later.
  it('strips anything unsafe out of an inbound request id', async () => {
    const res = await request(app.getHttpServer()).get('/health').set('X-Request-Id', 'trace 1/../etc:passwd').expect(200);

    expect(res.headers['x-request-id']).toBe('trace1..etcpasswd');
  });

  it('generates one when the inbound value sanitises away to nothing', async () => {
    const res = await request(app.getHttpServer()).get('/health').set('X-Request-Id', '///').expect(200);

    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
