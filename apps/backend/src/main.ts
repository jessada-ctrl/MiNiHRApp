import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: true — LineSignatureGuard (NFR-3) needs the exact raw bytes LINE
  // signed, not the re-serialized parsed JSON (which can differ byte-for-byte
  // from what was actually sent and would make every signature check fail).
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Dev-only: a free ngrok account only gets one stable public hostname, so
  // the LIFF app (its own Next.js dev server on :3002) is exposed through
  // this same tunnel under /liff instead of a second tunnel. Remove once
  // each app is deployed behind its own real domain.
  //
  // Mounted at root (not app.use('/liff', ...)) with pathFilter instead —
  // Express strips the mount prefix from req.url before an app.use('/liff', fn)
  // middleware sees it, which would forward "/register" instead of
  // "/liff/register" to the target. The liff-app's Next.js basePath ('/liff')
  // expects the full prefixed path, so it must survive the proxy untouched.
  //
  // Also matches several path shapes basePath doesn't apply to in this
  // Next.js/Turbopack version — confirmed by hitting each directly:
  //  - /__nextjs_* : Next dev mode's own internal endpoints (e.g. font loading)
  //  - /_next/*    : Turbopack's dynamic-import chunk loader (e.g. the
  //                  @line/liff code-split chunk) computes chunk URLs
  //                  without the basePath prefix, unlike statically-known
  //                  chunks referenced from the initial HTML
  //  - /static/*   : same chunk-loader issue, a different path shape
  // None of these are real backend routes, so it's safe to catch them all
  // and forward to the liff-app dev server rather than TenantMiddleware.
  app.use(
    createProxyMiddleware({
      target: 'http://localhost:3002',
      changeOrigin: true,
      ws: true,
      pathFilter: (path) => path.startsWith('/liff') || path.startsWith('/__nextjs') || path.startsWith('/_next') || path.startsWith('/static'),
      // /liff/* and /__nextjs_* already resolve correctly on the liff-app
      // side as-is; /_next/* and /static/* are missing the basePath prefix
      // the Next.js app itself expects, so add it back before forwarding.
      pathRewrite: (path) => (path.startsWith('/liff') || path.startsWith('/__nextjs') ? path : `/liff${path}`),
    }),
  );

  // Production deploy only (see Dockerfile) — web-admin runs as its own
  // Next.js server on :3000, proxied under /admin the same way apps/liff-app
  // is proxied under /liff above. Unlike liff-app, this doesn't need the
  // bare /_next and /static catch-all: that workaround was specifically for
  // a Turbopack *dev-mode* chunk-loader quirk (confirmed by testing), and
  // web-admin is only ever served here as a production `next build` output,
  // where basePath is applied to every asset reference correctly.
  //
  // Bare "/" is included too and rewritten to "/admin" — web-admin's own
  // root route is the public marketing landing page, but the Next.js server
  // only answers under its baked-in /admin basePath (NEXT_BASE_PATH, see
  // next.config.ts), so the domain root has to be forwarded there rather
  // than left to fall through to AppController (which used to answer "/"
  // with the unused Nest boilerplate "Hello World!").
  app.use(
    createProxyMiddleware({
      target: 'http://localhost:3000',
      changeOrigin: true,
      pathFilter: (path) => path === '/' || path.startsWith('/admin'),
      pathRewrite: (path) => (path === '/' ? '/admin' : path),
    }),
  );

  // CORS_ORIGINS: comma-separated allowed origins for production (e.g. the
  // real domain). Falls back to any localhost port for local dev when unset.
  const corsOrigins = process.env.CORS_ORIGINS?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins?.length ? corsOrigins : [/^http:\/\/localhost:\d+$/],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
