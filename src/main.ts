import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  
  // await app.listen(process.env.PORT ?? 3001);

  app.enableCors({
    origin: 'http://localhost:3000', // your Next.js frontend
    methods: 'GET,POST',
    credentials: true,
  });

  await app.listen(3001, () => {
    console.log('Server is running at http://localhost:3001');
  })
  // console.log("PORT RUNNING:", port)
}
bootstrap();
