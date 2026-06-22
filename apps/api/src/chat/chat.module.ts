import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ChatService } from './chat.service';
import { ChatController, ChatMuteController } from './chat.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ProjectModule } from '../project/project.module';
import { NotificationModule } from '../notification/notification.module';

import { ConversationController } from './conversation.controller';

@Module({
  imports: [
    PrismaModule,
    ProjectModule,
    NotificationModule,
    MulterModule.register({ limits: { fileSize: 50 * 1024 * 1024 } }) // 50MB limit
  ],
  providers: [ChatService],
  controllers: [ChatController, ChatMuteController, ConversationController],
  exports: [ChatService],
})
export class ChatModule {}
