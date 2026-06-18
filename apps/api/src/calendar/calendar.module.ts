import { Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { ActivityModule } from '../activity/activity.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [ActivityModule, RealtimeModule, NotificationModule],
  controllers: [CalendarController],
  providers: [CalendarService],
})
export class CalendarModule {}
