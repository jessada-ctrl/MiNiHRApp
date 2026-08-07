import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { MailerService } from './../src/auth/mailer.service';

const RUN = randomUUID().slice(0, 8);
const ORIGINAL_PASSWORD = 'OriginalPassw0rd!';

/**
 * Fixed, not per-run: the tenant this suite creates cannot be deleted
 * afterwards. These flows write audit rows (NFR-4), `audit_logs.tenant_id` is
 * ON DELETE SET NULL, and the immutability triggers from BUG-001 reject any
 * UPDATE on that table — so dropping the tenant fails by design. Reusing one
 * subdomain means the dev database ends up with exactly one leftover row no
 * matter how often the suite runs, rather than one per run. Employees and
 * tokens under it are cleared before each test.
 */
const SUBDOMAIN = 'pw-reset-e2e';

/** Captures what would have been emailed, so tests can redeem a real link. */
class CapturingMailer {
  sentResets: { email: string; url: string }[] = [];
  sentOtps: { email: string; code: string }[] = [];

  onModuleInit() {}
  sendPasswordReset(email: string, _fullName: string, resetUrl: string) {
    this.sentResets.push({ email, url: resetUrl });
    return Promise.resolve();
  }
  sendOtp(email: string, code: string) {
    this.sentOtps.push({ email, code });
    return Promise.resolve();
  }
}

/**
 * The password lifecycle, end to end over real HTTP against a real database:
 * change, forgot, redeem, HR reset — plus the two properties that are easy to
 * get subtly wrong and impossible to notice from the outside once they are:
 * a reset link being genuinely single-use, and a password change actually
 * cutting off sessions issued before it.
 *
 * The real rate-limiting guard stays active — see the note on the request
 * helpers for how the suite stays independent of it.
 */
describe('Password reset (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let mailer: CapturingMailer;
  let tenantId: string;
  let employeeId: string;
  let email: string;

  // Every request carries the tenant header — TenantMiddleware honours it
  // outside production, where there is no real subdomain to read — plus a
  // unique X-Forwarded-For.
  //
  // The rate limits are deliberately left switched on: forgot-password
  // allows 3 per 15 minutes per IP, and a suite that shared one source
  // address would have test order decide which assertions ever ran. Giving
  // each request its own apparent client address keeps them independent
  // while exercising the real guard, and only works because 'trust proxy' is
  // set below — so this doubles as a check that the throttler keys on the
  // forwarded client IP rather than on the proxy's.
  let clientIp = 0;
  const from = () => `10.${(++clientIp >> 16) & 0xff}.${(clientIp >> 8) & 0xff}.${clientIp & 0xff}`;
  const post = (path: string) =>
    request(app.getHttpServer()).post(path).set('X-Tenant-Subdomain', SUBDOMAIN).set('X-Forwarded-For', from());
  const get = (path: string) =>
    request(app.getHttpServer()).get(path).set('X-Tenant-Subdomain', SUBDOMAIN).set('X-Forwarded-For', from());

  beforeAll(async () => {
    prisma = new PrismaClient();
    const tenant = await prisma.tenant.upsert({
      where: { subdomain: SUBDOMAIN },
      update: {},
      create: { companyName: 'Password Reset E2E', subdomain: SUBDOMAIN },
    });
    tenantId = tenant.id;
    email = `pw-${RUN}@example.com`;

    mailer = new CapturingMailer();
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailerService)
      .useValue(mailer)
      .compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    // Both mirror main.ts, and both matter here: the ValidationPipe is what
    // enforces the DTO length rules under test, and 'trust proxy' is what
    // makes the per-request X-Forwarded-For above reach the throttler.
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    (app as NestExpressApplication).set('trust proxy', 1);
    await app.init();
  });

  beforeEach(async () => {
    mailer.sentResets = [];
    await prisma.passwordResetToken.deleteMany({ where: { tenantId } });
    await prisma.employee.deleteMany({ where: { tenantId } });
    const employee = await prisma.employee.create({
      data: {
        tenantId,
        employeeCode: `PW-${RUN}`,
        fullName: 'Pat Password',
        email,
        role: 'tenant_admin',
        status: 'active',
        passwordHash: await bcrypt.hash(ORIGINAL_PASSWORD, 10),
      },
    });
    employeeId = employee.id;
  });

  afterAll(async () => {
    // Employees and their tokens only — see the SUBDOMAIN note for why the
    // tenant row itself has to stay.
    await prisma.passwordResetToken.deleteMany({ where: { tenantId } });
    await prisma.employee.deleteMany({ where: { tenantId } });
    await prisma.$disconnect();
    await app.close();
  });

  const login = (password: string) => post('/auth/login').send({ email, password });

  /** Supertest types `body` as `any`; name the shape once instead of at every use. */
  const sessionOf = (res: { body: unknown }) => res.body as { accessToken: string; user: { mustChangePassword: boolean } };

  const tokenFromLastEmail = () => new URL(mailer.sentResets.at(-1)!.url).searchParams.get('token')!;

  describe('forgot password', () => {
    it('emails a reset link to a real account', async () => {
      await post('/auth/forgot-password').send({ email }).expect(200);
      expect(mailer.sentResets).toHaveLength(1);
      expect(mailer.sentResets[0].email).toBe(email);
      expect(tokenFromLastEmail().length).toBeGreaterThan(20);
    });

    // The response must not reveal whether the address is a real account, or
    // this endpoint becomes a way to enumerate who works at the company.
    it('answers identically for an unknown address, and sends nothing', async () => {
      const known = await post('/auth/forgot-password').send({ email }).expect(200);
      const unknown = await post('/auth/forgot-password').send({ email: `nobody-${RUN}@example.com` }).expect(200);

      expect(unknown.body).toEqual(known.body);
      expect(mailer.sentResets).toHaveLength(1);
    });

    it('retires an earlier outstanding link when a new one is requested', async () => {
      await post('/auth/forgot-password').send({ email }).expect(200);
      const firstToken = tokenFromLastEmail();
      await post('/auth/forgot-password').send({ email }).expect(200);

      await post('/auth/reset-password').send({ token: firstToken, newPassword: 'BrandNewPass1' }).expect(400);
      await post('/auth/reset-password').send({ token: tokenFromLastEmail(), newPassword: 'BrandNewPass1' }).expect(200);
    });
  });

  describe('redeeming a link', () => {
    beforeEach(async () => {
      await post('/auth/forgot-password').send({ email }).expect(200);
    });

    it('sets the new password and leaves the old one unusable', async () => {
      await post('/auth/reset-password').send({ token: tokenFromLastEmail(), newPassword: 'BrandNewPass1' }).expect(200);

      await login(ORIGINAL_PASSWORD).then((res) => expect(res.status).toBe(401));
      await login('BrandNewPass1').then((res) => expect(res.status).toBe(200));
    });

    it('is single-use', async () => {
      const token = tokenFromLastEmail();
      await post('/auth/reset-password').send({ token, newPassword: 'BrandNewPass1' }).expect(200);
      await post('/auth/reset-password').send({ token, newPassword: 'SomethingElse2' }).expect(400);

      // The second attempt must not have taken effect either.
      await login('SomethingElse2').then((res) => expect(res.status).toBe(401));
    });

    it('rejects an expired link', async () => {
      const token = tokenFromLastEmail();
      await prisma.passwordResetToken.updateMany({ where: { tenantId }, data: { expiresAt: new Date(Date.now() - 1000) } });

      await post('/auth/reset-password').send({ token, newPassword: 'BrandNewPass1' }).expect(400);
      await login(ORIGINAL_PASSWORD).then((res) => expect(res.status).toBe(200));
    });

    it('rejects a made-up token', async () => {
      await post('/auth/reset-password').send({ token: 'not-a-real-token', newPassword: 'BrandNewPass1' }).expect(400);
    });

    it('rejects a password shorter than the minimum', async () => {
      await post('/auth/reset-password').send({ token: tokenFromLastEmail(), newPassword: 'short1' }).expect(400);
      await login(ORIGINAL_PASSWORD).then((res) => expect(res.status).toBe(200));
    });

    it('refuses to set the password back to the current one', async () => {
      await post('/auth/reset-password').send({ token: tokenFromLastEmail(), newPassword: ORIGINAL_PASSWORD }).expect(400);
    });
  });

  describe('changing a known password', () => {
    it('requires the current password to be correct', async () => {
      const session = sessionOf(await login(ORIGINAL_PASSWORD));
      await post('/auth/change-password')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ currentPassword: 'WrongPassw0rd!', newPassword: 'BrandNewPass1' })
        .expect(401);

      await login(ORIGINAL_PASSWORD).then((res) => expect(res.status).toBe(200));
    });

    it('returns a working replacement token and invalidates the old one', async () => {
      const oldToken = sessionOf(await login(ORIGINAL_PASSWORD)).accessToken;

      // `iat` is a whole-second claim, so a change completing inside the same
      // second the token was issued cannot be distinguished from one that
      // predates it — an inherent one-second window, not a flaw worth
      // engineering around. Waiting past it is what makes this assertion
      // deterministic rather than a coin flip on execution speed.
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const changed = sessionOf(
        await post('/auth/change-password')
          .set('Authorization', `Bearer ${oldToken}`)
          .send({ currentPassword: ORIGINAL_PASSWORD, newPassword: 'BrandNewPass1' })
          .expect(200),
      );

      await get('/auth/me').set('Authorization', `Bearer ${oldToken}`).expect(401);
      await get('/auth/me').set('Authorization', `Bearer ${changed.accessToken}`).expect(200);
    });
  });

  describe('HR-initiated reset', () => {
    it('issues a temp password, flags the account, and cuts existing sessions', async () => {
      const hrSession = sessionOf(await login(ORIGINAL_PASSWORD));

      const target = await prisma.employee.create({
        data: {
          tenantId,
          employeeCode: `PW2-${RUN}`,
          fullName: 'Sam Subject',
          email: `pw2-${RUN}@example.com`,
          role: 'employee',
          status: 'active',
          passwordHash: await bcrypt.hash('SubjectPassw0rd!', 10),
        },
      });

      const subjectSession = sessionOf(
        await post('/auth/login').send({ email: target.email, password: 'SubjectPassw0rd!' }).expect(200),
      );
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const reset = await post(`/employees/${target.id}/reset-password`)
        .set('Authorization', `Bearer ${hrSession.accessToken}`)
        .expect(200);

      const { tempPassword } = reset.body as { tempPassword: string };
      expect(tempPassword).toEqual(expect.any(String));
      await get('/auth/me').set('Authorization', `Bearer ${subjectSession.accessToken}`).expect(401);

      const relogin = sessionOf(await post('/auth/login').send({ email: target.email, password: tempPassword }).expect(200));
      expect(relogin.user.mustChangePassword).toBe(true);
    });

    it('is refused to a non-admin', async () => {
      const target = await prisma.employee.create({
        data: {
          tenantId,
          employeeCode: `PW3-${RUN}`,
          fullName: 'Lee Regular',
          email: `pw3-${RUN}@example.com`,
          role: 'employee',
          status: 'active',
          passwordHash: await bcrypt.hash('RegularPassw0rd!', 10),
        },
      });
      const session = sessionOf(
        await post('/auth/login').send({ email: target.email, password: 'RegularPassw0rd!' }).expect(200),
      );

      await post(`/employees/${employeeId}/reset-password`)
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(403);
    });
  });
});
