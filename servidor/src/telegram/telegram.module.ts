import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { WebController } from './web.controller';

@Module({
  controllers: [WebController],
  providers: [TelegramService],
})
export class TelegramModule {}
