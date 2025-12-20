import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: '*',
    allowedHeaders: ['Authorization', 'Content-Type'],
  });

  // 🔑 CLAVE: usar el puerto que Render (o cualquier hosting) proporciona
  const port = process.env.PORT || 3000;

  await app.listen(port);

  console.log(`🚀 Application is running on port ${port}`);
}

bootstrap();