import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LlmService } from './modules/llm/llm.service';
import { AvailabilityService } from './modules/meetings/availability/availability.service';
import { MeetingsService } from './modules/meetings/meetings/meetings.service';
import { ChatController } from './modules/chat/chat.controller';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './config/prisma/prisma/prisma.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
  ],
  controllers: [AppController, ChatController],
  providers: [AppService, MeetingsService, LlmService, AvailabilityService, PrismaService],
})
export class AppModule {}
