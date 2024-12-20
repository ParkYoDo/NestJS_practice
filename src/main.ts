import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // class-validator 사용하기위해 global pipe 사용
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // dto에 정의된 타입만 사용한다 (데이터 핸들링)
      forbidNonWhitelisted: true, // dto에 정의되지 않은 타입은 에러를 반환
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
