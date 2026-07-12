import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: true — LineSignatureGuard (NFR-3) needs the exact raw bytes LINE
  // signed, not the re-serialized parsed JSON (which can differ byte-for-byte
  // from what was actually sent and would make every signature check fail).
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.enableCors({
    // Local dev origins for the two frontends. Tighten to real domains
    // before production, and note the LIFF app is a different origin again
    // once it has a real LINE-hosted URL.
    origin: [/^http:\/\/localhost:\d+$/],
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
