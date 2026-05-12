import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    bodyParser: false, // 🔥 CLAVE PARA STRIPE
  });

  app.enableCors({
    origin: '*',
    allowedHeaders: ['Authorization', 'Content-Type'],
  });

  // 🔥 SOLO EL WEBHOOK VA EN RAW
  app.use(
    '/billing/webhook',
    bodyParser.raw({ type: 'application/json' }),
  );

  // 🔥 RESTO DE ENDPOINTS NORMAL
  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

  const port = process.env.PORT || 3000;

  await app.listen(port);

  console.log(`🚀 Application is running on port ${port}`);
}

bootstrap();