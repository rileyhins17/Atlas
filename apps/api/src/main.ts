import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { loadEnv } from './config/env.js';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: true });

  // Security headers. The API serves JSON only, so a strict CSP is safe here —
  // the web app sets its own policy.
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'none'"] } } }));
  app.use(cookieParser());

  // Cap request bodies. Journal entries are the largest legitimate payload
  // (~20k chars), so 1mb is generous while still bounding abuse.
  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('urlencoded', { limit: '1mb', extended: true });

  // WEB_ORIGIN may be a comma-separated list (e.g. LAN testing from a phone
  // alongside localhost) — accept any of them.
  const allowedOrigins = env.WEB_ORIGIN.split(',').map((o) => o.trim());
  app.enableCors({ origin: allowedOrigins, credentials: true });

  // Behind the Caddy reverse proxy in production, so rate limiting and logs see
  // the real client IP rather than the proxy's.
  app.set('trust proxy', 1);

  app.enableShutdownHooks();

  await app.listen(env.API_PORT, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`Atlas API listening on http://localhost:${env.API_PORT}`);
}

void bootstrap();
