import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { readFileSync } from 'fs';
import { load } from 'js-yaml';
import { join } from 'path';
import { AppModule } from './app.module';
import { requestIdMiddleware } from './common/request-id';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', true);
  
  // L'IP réelle du client vient de X-Forwarded-For posé par le nginx du frontend : on fait confiance à 1 proxy par défaut
  // (TRUST_PROXY=2 si APISIX est devant le frontend, un CIDR est aussi accepté, vide = désactivé)
  const trustProxy = process.env.TRUST_PROXY ?? '1';
  if (trustProxy) app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);

  // X-Request-Id sur chaque requête : relie la réponse et les logs d'une même action (non stocké en base)
  app.use(requestIdMiddleware('auth'));

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();

  // Swagger UI sur /docs (JSON sur /docs-json), à partir de la spec maintenue à la main dans openapi.yaml
  const document = load(readFileSync(join(__dirname, '..', 'openapi.yaml'), 'utf8')) as OpenAPIObject;
  SwaggerModule.setup('docs', app, document);

  await app.listen(Number(process.env.PORT ?? 3000));
}
bootstrap();
